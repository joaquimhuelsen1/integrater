from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from uuid import UUID, uuid4
from datetime import datetime
import httpx

from app.deps import get_supabase, get_current_user_id
from app.models import (
    Message,
    MessageSendRequest,
    MessageWithAttachments,
    MessageDirection,
)
from app.utils.crypto import decrypt

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("/send", response_model=Message, status_code=201)
async def send_message(
    data: MessageSendRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    # Buscar conversa para obter info
    conv_result = db.table("conversations").select("*").eq(
        "id", str(data.conversation_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    conv = conv_result.data

    # Criar mensagem - usa ID do frontend se fornecido (evita duplicata com Realtime)
    message_id = data.id if data.id else uuid4()
    now = datetime.utcnow().isoformat()

    # Buscar identity_id da conversa
    identity_id = conv.get("primary_identity_id")
    if not identity_id and conv.get("contact_id"):
        # Buscar primeira identidade do contato
        id_result = db.table("contact_identities").select("id").eq(
            "contact_id", conv["contact_id"]
        ).limit(1).execute()
        if id_result.data:
            identity_id = id_result.data[0]["id"]

    external_message_id = f"local-{message_id}"
    channel = data.channel.value if data.channel else conv.get("last_channel", "telegram")

    # Buscar integration_account_id se não fornecido
    integration_account_id = data.integration_account_id
    if not integration_account_id and channel == "telegram":
        # Buscar do workspace da conversa
        workspace_id = conv.get("workspace_id")
        if workspace_id:
            int_result = db.table("integration_accounts").select("id").eq(
                "workspace_id", workspace_id
            ).eq("type", "telegram_user").eq("is_active", True).limit(1).execute()
            if int_result.data:
                integration_account_id = int_result.data[0]["id"]

        # Fallback: primeira conta ativa do owner
        if not integration_account_id:
            int_result = db.table("integration_accounts").select("id").eq(
                "owner_id", str(owner_id)
            ).eq("type", "telegram_user").eq("is_active", True).limit(1).execute()
            if int_result.data:
                integration_account_id = int_result.data[0]["id"]

    # Para emails: buscar última mensagem inbound para threading correto
    email_reply_to = None
    email_subject = None
    if channel == "email":
        last_inbound = db.table("messages").select(
            "external_message_id, subject"
        ).eq("conversation_id", str(data.conversation_id)).eq(
            "direction", "inbound"
        ).eq("channel", "email").order(
            "sent_at", desc=True
        ).limit(1).execute()

        if last_inbound.data:
            email_reply_to = last_inbound.data[0].get("external_message_id")
            original_subject = last_inbound.data[0].get("subject", "")
            if original_subject:
                # Adiciona "Re:" se não tiver
                if not original_subject.lower().startswith("re:"):
                    email_subject = f"Re: {original_subject}"
                else:
                    email_subject = original_subject

    message_payload = {
        "id": str(message_id),
        "owner_id": str(owner_id),
        "conversation_id": str(data.conversation_id),
        "integration_account_id": str(integration_account_id) if integration_account_id else None,
        "identity_id": identity_id,
        "channel": channel,
        "direction": MessageDirection.outbound.value,
        "external_message_id": external_message_id,
        "external_reply_to_message_id": email_reply_to,
        "subject": email_subject,
        "text": data.text,
        "sent_at": now,
        "raw_payload": {},
    }

    result = db.table("messages").insert(message_payload).execute()

    # Vincular attachments se houver
    if data.attachments:
        for att_id in data.attachments:
            db.table("attachments").update(
                {"message_id": str(message_id)}
            ).eq("id", str(att_id)).eq("owner_id", str(owner_id)).execute()

    # Atualizar last_message_at e preview da conversa
    preview = (data.text[:100] + "...") if data.text and len(data.text) > 100 else data.text
    db.table("conversations").update({
        "last_message_at": now,
        "last_message_preview": preview,
    }).eq("id", str(data.conversation_id)).execute()

    # Enviar via canal apropriado (channel já definido acima)
    send_status = "sent"
    external_id = None

    if channel == "telegram":
        print(f"[Telegram] Enviando mensagem para conversa {data.conversation_id}")
        
        # Buscar telegram_user_id da identity
        telegram_user_id = None
        if identity_id:
            identity_result = db.table("contact_identities").select("value, type").eq(
                "id", identity_id
            ).single().execute()
            if identity_result.data and identity_result.data.get("type") == "telegram_user":
                telegram_user_id = int(identity_result.data.get("value"))
                print(f"[Telegram] telegram_user_id via identity: {telegram_user_id}")
        
        if telegram_user_id and integration_account_id:
            # Buscar attachments URLs se houver
            attachment_urls = []
            if data.attachments:
                for att_id in data.attachments:
                    att_result = db.table("attachments").select(
                        "storage_bucket, storage_path"
                    ).eq("id", str(att_id)).single().execute()
                    if att_result.data:
                        bucket = att_result.data.get("storage_bucket", "attachments")
                        path = att_result.data.get("storage_path")
                        if path:
                            from ..config import get_settings
                            settings = get_settings()
                            url = f"{settings.supabase_url}/storage/v1/object/public/{bucket}/{path}"
                            attachment_urls.append(url)
            
            # Chamar webhook n8n /send
            try:
                import os
                n8n_webhook_url = os.environ.get(
                    "N8N_TELEGRAM_SEND_WEBHOOK", 
                    "https://n8nwebhook.thereconquestmap.com/webhook/telegram/send"
                )
                n8n_api_key = os.environ.get("N8N_API_KEY", "")
                
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.post(
                        n8n_webhook_url,
                        headers={
                            "X-API-KEY": n8n_api_key,
                            "Content-Type": "application/json",
                        },
                        json={
                            "conversation_id": str(data.conversation_id),
                            "text": data.text or "",
                            "attachments": attachment_urls,
                        },
                    )
                
                if response.status_code == 200:
                    resp_data = response.json()
                    if resp_data.get("status") == "ok":
                        external_id = str(resp_data.get("telegram_msg_id"))
                        send_status = "sent"
                        print(f"[Telegram] Enviado via n8n com sucesso: {external_id}")
                    else:
                        send_status = "failed"
                        print(f"[Telegram] Erro do n8n: {resp_data.get('error')}")
                else:
                    send_status = "failed"
                    print(f"[Telegram] Erro HTTP n8n: {response.status_code} {response.text}")
            except Exception as e:
                send_status = "failed"
                print(f"[Telegram] Exceção ao enviar via n8n: {e}")
        else:
            print(f"[Telegram] telegram_user_id ou integration_account_id não encontrado")

    elif channel == "openphone_sms":
        print(f"[OpenPhone] Enviando SMS para conversa {data.conversation_id}")

        # Buscar conta de integração (da request ou primeira ativa)
        account_id = data.integration_account_id
        if not account_id:
            acc_search = db.table("integration_accounts").select("id").eq(
                "owner_id", str(owner_id)
            ).eq("type", "openphone").eq("is_active", True).limit(1).execute()
            if acc_search.data:
                account_id = acc_search.data[0]["id"]

        if account_id:
            acc_result = db.table("integration_accounts").select("*").eq(
                "id", str(account_id)
            ).single().execute()

            if acc_result.data:
                account = acc_result.data
                to_phone = None

                # Primeiro tenta pelo primary_identity_id
                if conv.get("primary_identity_id"):
                    identity_result = db.table("contact_identities").select("value, type").eq(
                        "id", conv["primary_identity_id"]
                    ).single().execute()
                    if identity_result.data and identity_result.data.get("type") == "phone":
                        to_phone = identity_result.data.get("value")
                        print(f"[OpenPhone] Telefone via primary_identity: {to_phone}")

                # Fallback: busca pelo contact_id
                if not to_phone and conv.get("contact_id"):
                    identity_result = db.table("contact_identities").select("value").eq(
                        "contact_id", conv["contact_id"]
                    ).eq("type", "phone").limit(1).execute()
                    if identity_result.data:
                        to_phone = identity_result.data[0].get("value")
                        print(f"[OpenPhone] Telefone via contact_id: {to_phone}")

                if to_phone:
                    api_key = decrypt(account["secrets_encrypted"])
                    from_number = account["config"]["phone_number"]
                    print(f"[OpenPhone] Enviando de {from_number} para {to_phone}")

                    # Enviar via OpenPhone API
                    try:
                        async with httpx.AsyncClient() as client:
                            response = await client.post(
                                "https://api.openphone.com/v1/messages",
                                headers={
                                    "Authorization": api_key,
                                    "Content-Type": "application/json",
                                },
                                json={
                                    "from": from_number,
                                    "to": [to_phone],
                                    "content": data.text,
                                },
                            )

                        if response.status_code in (200, 201, 202):
                            resp_data = response.json().get("data", {})
                            external_id = resp_data.get("id")
                            send_status = "sent"
                            print(f"[OpenPhone] Enviado com sucesso: {external_id}")
                        else:
                            send_status = "failed"
                            print(f"[OpenPhone] Erro ao enviar: {response.status_code} {response.text}")
                    except Exception as e:
                        send_status = "failed"
                        print(f"[OpenPhone] Exceção ao enviar: {e}")
                else:
                    print(f"[OpenPhone] Telefone não encontrado para conversa")

    # Atualizar external_message_id se enviou com sucesso
    if external_id:
        db.table("messages").update({
            "external_message_id": external_id
        }).eq("id", str(message_id)).execute()

    # Se envio falhou, deletar mensagem e retornar erro
    if send_status == "failed":
        db.table("messages").delete().eq("id", str(message_id)).execute()
        raise HTTPException(status_code=500, detail="Falha ao enviar mensagem")

    # Retornar mensagem atualizada
    final_result = db.table("messages").select("*").eq("id", str(message_id)).single().execute()
    return final_result.data


@router.get("/{message_id}", response_model=MessageWithAttachments)
async def get_message(
    message_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    result = db.table("messages").select(
        "*, attachments(*)"
    ).eq("id", str(message_id)).eq("owner_id", str(owner_id)).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")

    return result.data


@router.put("/{message_id}")
async def edit_message(
    message_id: UUID,
    text: str,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Edita o texto de uma mensagem.
    Só pode editar mensagens outbound (enviadas pelo usuário).
    Cria um job para o worker editar no canal externo (Telegram/etc).
    """
    # Buscar mensagem
    msg_result = db.table("messages").select("*").eq(
        "id", str(message_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not msg_result.data:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")

    msg = msg_result.data

    # Só pode editar mensagens outbound
    if msg["direction"] != "outbound":
        raise HTTPException(status_code=400, detail="Só pode editar mensagens enviadas")

    # Validar tamanho do texto
    if not text or len(text.strip()) < 1:
        raise HTTPException(status_code=400, detail="Texto não pode ser vazio")

    if len(text) > 4096:
        raise HTTPException(status_code=400, detail="Texto muito longo (máx 4096)")

    now = datetime.utcnow().isoformat()

    # Atualizar mensagem no banco
    db.table("messages").update({
        "text": text.strip(),
        "edited_at": now,
    }).eq("id", str(message_id)).execute()

    # Criar job para o worker editar no canal externo
    job_id = uuid4()
    db.table("message_jobs").insert({
        "id": str(job_id),
        "owner_id": str(owner_id),
        "message_id": str(message_id),
        "integration_account_id": msg.get("integration_account_id"),
        "action": "edit",
        "payload": {
            "new_text": text.strip(),
            "external_message_id": msg.get("external_message_id"),
            "channel": msg.get("channel"),
        },
        "status": "pending",
        "created_at": now,
    }).execute()

    # Retornar mensagem atualizada
    result = db.table("messages").select("*").eq("id", str(message_id)).single().execute()
    return result.data


@router.delete("/{message_id}")
async def delete_message(
    message_id: UUID,
    for_everyone: bool = True,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Deleta uma mensagem.
    for_everyone=True: deleta no Telegram E marca como deletada no banco
    for_everyone=False: apenas marca como deletada no banco (soft delete)
    Só pode deletar mensagens outbound (enviadas pelo usuário).
    """
    # Buscar mensagem
    msg_result = db.table("messages").select("*").eq(
        "id", str(message_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not msg_result.data:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")

    msg = msg_result.data

    # Só pode deletar mensagens outbound
    if msg["direction"] != "outbound":
        raise HTTPException(status_code=400, detail="Só pode deletar mensagens enviadas")

    now = datetime.utcnow().isoformat()

    # Soft delete no banco
    db.table("messages").update({
        "deleted_at": now,
    }).eq("id", str(message_id)).execute()

    # Se for_everyone, criar job para deletar no canal externo
    if for_everyone:
        job_id = uuid4()
        db.table("message_jobs").insert({
            "id": str(job_id),
            "owner_id": str(owner_id),
            "message_id": str(message_id),
            "integration_account_id": msg.get("integration_account_id"),
            "action": "delete",
            "payload": {
                "external_message_id": msg.get("external_message_id"),
                "channel": msg.get("channel"),
            },
            "status": "pending",
            "created_at": now,
        }).execute()

    return {"success": True, "deleted_at": now, "for_everyone": for_everyone}


@router.post("/typing")
async def send_typing(
    data: dict,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Envia notificação de 'digitando...' para o Telegram.
    Cria um job na tabela message_jobs com action='typing'.
    O worker vai processar e enviar o typing action.
    """
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        raise HTTPException(status_code=400, detail="conversation_id é obrigatório")

    # Buscar conversa
    conv_result = db.table("conversations").select("*").eq(
        "id", str(conversation_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    conv = conv_result.data

    # Só funciona para Telegram
    if conv.get("last_channel") != "telegram":
        return {"success": False, "reason": "Typing só funciona para Telegram"}

    # Buscar integration account do Telegram
    int_result = db.table("integration_accounts").select("id").eq(
        "owner_id", str(owner_id)
    ).eq("type", "telegram_user").eq("is_active", True).limit(1).execute()

    if not int_result.data:
        return {"success": False, "reason": "Sem integração Telegram ativa"}

    integration_account_id = int_result.data[0]["id"]

    # Buscar identity para obter telegram_user_id
    identity_id = conv.get("primary_identity_id")
    if not identity_id:
        return {"success": False, "reason": "Sem identity na conversa"}

    id_result = db.table("contact_identities").select("*").eq(
        "id", identity_id
    ).single().execute()

    if not id_result.data:
        return {"success": False, "reason": "Identity não encontrada"}

    identity = id_result.data
    telegram_user_id = identity.get("metadata", {}).get("telegram_user_id")

    if not telegram_user_id:
        return {"success": False, "reason": "Sem telegram_user_id na identity"}

    # Criar job de typing
    now = datetime.utcnow().isoformat()
    job_id = uuid4()

    db.table("message_jobs").insert({
        "id": str(job_id),
        "owner_id": str(owner_id),
        "message_id": None,  # Não há mensagem, é só typing
        "integration_account_id": integration_account_id,
        "action": "typing",
        "payload": {
            "telegram_user_id": telegram_user_id,
            "conversation_id": str(conversation_id),
        },
        "status": "pending",
        "created_at": now,
    }).execute()

    return {"success": True, "job_id": str(job_id)}
