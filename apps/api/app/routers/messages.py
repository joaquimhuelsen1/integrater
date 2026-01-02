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


@router.post("/send", status_code=201)
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
    channel = data.channel.value if data.channel else conv.get("last_channel", "telegram")

    # ============================================
    # TELEGRAM: n8n faz tudo (não insere no banco)
    # ============================================
    if channel == "telegram":
        print(f"[Telegram] Enviando mensagem para conversa {data.conversation_id}")
        
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
        
        # Chamar webhook n8n /send - n8n insere no banco
        try:
            import os
            n8n_webhook_url = os.environ.get(
                "N8N_TELEGRAM_SEND_WEBHOOK", 
                "https://n8nwebhook.thereconquestmap.com/webhook/telegram/send"
            )
            n8n_api_key = os.environ.get("N8N_API_KEY", "")
            
            # Usar ID do frontend se fornecido, senão gerar novo
            message_id = str(data.id) if data.id else str(uuid4())
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    n8n_webhook_url,
                    headers={
                        "X-API-KEY": n8n_api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "id": message_id,  # ID do frontend para evitar duplicata
                        "conversation_id": str(data.conversation_id),
                        "text": data.text or "",
                        "attachments": attachment_urls,
                    },
                )
            
            if response.status_code == 200:
                resp_data = response.json()
                if resp_data.get("status") == "ok":
                    print(f"[Telegram] Enviado via n8n com sucesso: {resp_data.get('telegram_msg_id')}")
                    # Retorna dados - ID é o mesmo que enviamos para o n8n
                    return {
                        "id": message_id,  # Mesmo ID do frontend
                        "conversation_id": str(data.conversation_id),
                        "direction": "outbound",
                        "text": data.text,
                        "channel": "telegram",
                        "sent_at": datetime.utcnow().isoformat(),
                        "external_message_id": str(resp_data.get("telegram_msg_id")),
                        "sending_status": "sent",
                    }
                else:
                    print(f"[Telegram] Erro do n8n: {resp_data.get('error')}")
                    raise HTTPException(status_code=500, detail=resp_data.get('error', 'Erro ao enviar'))
            else:
                print(f"[Telegram] Erro HTTP n8n: {response.status_code} {response.text}")
                raise HTTPException(status_code=500, detail=f"Erro n8n: {response.status_code}")
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Telegram] Exceção ao enviar via n8n: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ============================================
    # OUTROS CANAIS: API insere no banco
    # ============================================
    message_id = data.id if data.id else uuid4()
    now = datetime.utcnow().isoformat()

    # Buscar identity_id da conversa
    identity_id = conv.get("primary_identity_id")
    if not identity_id and conv.get("contact_id"):
        id_result = db.table("contact_identities").select("id").eq(
            "contact_id", conv["contact_id"]
        ).limit(1).execute()
        if id_result.data:
            identity_id = id_result.data[0]["id"]

    external_message_id = f"local-{message_id}"

    # Buscar integration_account_id
    integration_account_id = data.integration_account_id

    # Para emails: buscar última mensagem inbound para threading
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

    # Enviar via canal apropriado
    send_status = "sent"
    external_id = None

    if channel == "openphone_sms":
        print(f"[OpenPhone] Enviando SMS para conversa {data.conversation_id}")

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

                if conv.get("primary_identity_id"):
                    identity_result = db.table("contact_identities").select("value, type").eq(
                        "id", conv["primary_identity_id"]
                    ).single().execute()
                    if identity_result.data and identity_result.data.get("type") == "phone":
                        to_phone = identity_result.data.get("value")

                if not to_phone and conv.get("contact_id"):
                    identity_result = db.table("contact_identities").select("value").eq(
                        "contact_id", conv["contact_id"]
                    ).eq("type", "phone").limit(1).execute()
                    if identity_result.data:
                        to_phone = identity_result.data[0].get("value")

                if to_phone:
                    api_key = decrypt(account["secrets_encrypted"])
                    from_number = account["config"]["phone_number"]

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
                        else:
                            send_status = "failed"
                    except Exception as e:
                        send_status = "failed"
                        print(f"[OpenPhone] Exceção: {e}")

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
    msg_result = db.table("messages").select("*").eq(
        "id", str(message_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not msg_result.data:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")

    msg = msg_result.data

    if msg["direction"] != "outbound":
        raise HTTPException(status_code=400, detail="Só pode editar mensagens enviadas")

    if not text or len(text.strip()) < 1:
        raise HTTPException(status_code=400, detail="Texto não pode ser vazio")

    if len(text) > 4096:
        raise HTTPException(status_code=400, detail="Texto muito longo (máx 4096)")

    now = datetime.utcnow().isoformat()

    db.table("messages").update({
        "text": text.strip(),
        "edited_at": now,
    }).eq("id", str(message_id)).execute()

    # Criar job para editar no canal externo
    if msg.get("channel") == "telegram" and msg.get("external_message_id"):
        db.table("message_jobs").insert({
            "owner_id": str(owner_id),
            "message_id": str(message_id),
            "integration_account_id": msg.get("integration_account_id"),
            "action": "edit",
            "payload": {"new_text": text.strip()},
            "status": "pending",
        }).execute()

    return {"status": "ok", "edited_at": now}


@router.delete("/{message_id}")
async def delete_message(
    message_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Deleta uma mensagem (soft delete).
    Só pode deletar mensagens outbound (enviadas pelo usuário).
    Cria um job para deletar no canal externo (Telegram/etc).
    """
    msg_result = db.table("messages").select("*").eq(
        "id", str(message_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not msg_result.data:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")

    msg = msg_result.data

    if msg["direction"] != "outbound":
        raise HTTPException(status_code=400, detail="Só pode deletar mensagens enviadas")

    now = datetime.utcnow().isoformat()

    db.table("messages").update({
        "deleted_at": now,
    }).eq("id", str(message_id)).execute()

    # Criar job para deletar no canal externo
    if msg.get("channel") == "telegram" and msg.get("external_message_id"):
        db.table("message_jobs").insert({
            "owner_id": str(owner_id),
            "message_id": str(message_id),
            "integration_account_id": msg.get("integration_account_id"),
            "action": "delete",
            "payload": {},
            "status": "pending",
        }).execute()

    return {"status": "ok", "deleted_at": now}


@router.post("/typing")
async def send_typing(
    conversation_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Envia indicador de digitação para o canal.
    Cria um job para o worker enviar o typing action.
    """
    conv_result = db.table("conversations").select(
        "id, last_channel, primary_identity_id"
    ).eq("id", str(conversation_id)).eq("owner_id", str(owner_id)).single().execute()

    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    conv = conv_result.data

    if conv.get("last_channel") != "telegram":
        return {"status": "skipped", "reason": "Only telegram supports typing"}

    # Buscar integration_account_id
    workspace_result = db.table("conversations").select("workspace_id").eq(
        "id", str(conversation_id)
    ).single().execute()
    
    workspace_id = workspace_result.data.get("workspace_id") if workspace_result.data else None
    
    integration_account_id = None
    if workspace_id:
        int_result = db.table("integration_accounts").select("id").eq(
            "workspace_id", workspace_id
        ).eq("type", "telegram_user").eq("is_active", True).limit(1).execute()
        if int_result.data:
            integration_account_id = int_result.data[0]["id"]

    if not integration_account_id:
        int_result = db.table("integration_accounts").select("id").eq(
            "owner_id", str(owner_id)
        ).eq("type", "telegram_user").eq("is_active", True).limit(1).execute()
        if int_result.data:
            integration_account_id = int_result.data[0]["id"]

    if not integration_account_id:
        return {"status": "skipped", "reason": "No telegram account"}

    # Buscar telegram_user_id
    identity_id = conv.get("primary_identity_id")
    if not identity_id:
        return {"status": "skipped", "reason": "No identity"}

    identity_result = db.table("contact_identities").select("value").eq(
        "id", identity_id
    ).single().execute()

    if not identity_result.data:
        return {"status": "skipped", "reason": "Identity not found"}

    telegram_user_id = identity_result.data.get("value")

    # Criar job de typing
    db.table("message_jobs").insert({
        "owner_id": str(owner_id),
        "message_id": None,
        "integration_account_id": integration_account_id,
        "action": "typing",
        "payload": {"telegram_user_id": int(telegram_user_id)},
        "status": "pending",
    }).execute()

    return {"status": "ok"}
