from fastapi import APIRouter, Depends, HTTPException, Query
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
    
    # Priorizar last_channel da conversa (mais confiável que channel do frontend)
    last_channel = conv.get("last_channel")
    if last_channel:
        channel = last_channel
    elif data.channel:
        channel = data.channel.value
    else:
        channel = "telegram"
    
    print(f"[DEBUG] send_message: channel={channel}, data.channel={data.channel}, last_channel={last_channel}")

    # ============================================
    # TELEGRAM: n8n faz tudo (não insere no banco)
    # ============================================
    if channel == "telegram":
        print(f"[Telegram] Enviando mensagem para conversa {data.conversation_id}")
        
        # Buscar attachments URLs se houver (signed URLs pois bucket é privado)
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
                        # Gerar signed URL (válida por 1 hora)
                        signed = db.storage.from_(bucket).create_signed_url(path, 3600)
                        if signed and signed.get("signedURL"):
                            attachment_urls.append(signed["signedURL"])
                            print(f"[Telegram] Signed URL gerada para {path}")
        
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
                        "reply_to_message_id": str(data.reply_to_message_id) if data.reply_to_message_id else None,
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
    # EMAIL: n8n faz tudo (nao insere no banco)
    # ============================================
    if channel == "email":
        print(f"[Email] Enviando email para conversa {data.conversation_id}")
        
        # Buscar attachments URLs se houver (signed URLs pois bucket é privado)
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
                        # Gerar signed URL (válida por 1 hora)
                        signed = db.storage.from_(bucket).create_signed_url(path, 3600)
                        if signed and signed.get("signedURL"):
                            attachment_urls.append(signed["signedURL"])
                            print(f"[Email] Signed URL gerada para {path}")
        
        # Buscar ultima mensagem inbound para threading
        email_reply_to = None
        email_subject = None
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
        
        # Chamar webhook n8n /email/send - n8n insere no banco
        try:
            import os
            n8n_webhook_url = os.environ.get(
                "N8N_WEBHOOK_EMAIL_SEND", 
                "https://n8nwebhook.thereconquestmap.com/webhook/email/send"
            )
            n8n_api_key = os.environ.get("N8N_API_KEY", "")
            
            # Usar ID do frontend se fornecido, senao gerar novo
            message_id = str(data.id) if data.id else str(uuid4())
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    n8n_webhook_url,
                    headers={
                        "X-API-KEY": n8n_api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "id": message_id,
                        "conversation_id": str(data.conversation_id),
                        "text": data.text or "",
                        "subject": email_subject,
                        "in_reply_to": email_reply_to,
                        "attachments": attachment_urls,
                    },
                )
            
            if response.status_code == 200:
                resp_data = response.json()
                if resp_data.get("status") == "ok":
                    print(f"[Email] Enviado via n8n com sucesso: {resp_data.get('message_id')}")
                    return {
                        "id": message_id,
                        "conversation_id": str(data.conversation_id),
                        "direction": "outbound",
                        "text": data.text,
                        "channel": "email",
                        "subject": email_subject,
                        "sent_at": datetime.utcnow().isoformat(),
                        "external_message_id": resp_data.get("message_id"),
                        "sending_status": "sent",
                    }
                else:
                    print(f"[Email] Erro do n8n: {resp_data.get('error')}")
                    raise HTTPException(status_code=500, detail=resp_data.get('error', 'Erro ao enviar'))
            else:
                print(f"[Email] Erro HTTP n8n: {response.status_code} {response.text}")
                raise HTTPException(status_code=500, detail=f"Erro n8n: {response.status_code}")
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Email] Excecao ao enviar via n8n: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ============================================
    # OPENPHONE SMS: n8n faz tudo (nao insere no banco)
    # ============================================
    if channel == "openphone_sms":
        print(f"[OpenPhone] Enviando SMS para conversa {data.conversation_id}")
        
        # Chamar webhook n8n /openphone/send - n8n insere no banco
        try:
            import os
            n8n_webhook_url = os.environ.get(
                "N8N_WEBHOOK_OPENPHONE_SEND", 
                "https://n8nwebhook.thereconquestmap.com/webhook/openphone/send"
            )
            n8n_api_key = os.environ.get("N8N_API_KEY", "")
            
            # Usar ID do frontend se fornecido, senao gerar novo
            message_id = str(data.id) if data.id else str(uuid4())
            
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    n8n_webhook_url,
                    headers={
                        "X-API-KEY": n8n_api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "id": message_id,
                        "conversation_id": str(data.conversation_id),
                        "text": data.text or "",
                    },
                )
            
            if response.status_code == 200:
                resp_data = response.json()
                if resp_data.get("status") == "ok":
                    print(f"[OpenPhone] Enviado via n8n com sucesso: {resp_data.get('external_id')}")
                    return {
                        "id": message_id,
                        "conversation_id": str(data.conversation_id),
                        "direction": "outbound",
                        "text": data.text,
                        "channel": "openphone_sms",
                        "sent_at": datetime.utcnow().isoformat(),
                        "external_message_id": resp_data.get("external_id"),
                        "sending_status": "sent",
                    }
                else:
                    print(f"[OpenPhone] Erro do n8n: {resp_data.get('error')}")
                    raise HTTPException(status_code=500, detail=resp_data.get('error', 'Erro ao enviar'))
            else:
                print(f"[OpenPhone] Erro HTTP n8n: {response.status_code} {response.text}")
                raise HTTPException(status_code=500, detail=f"Erro n8n: {response.status_code}")
        except HTTPException:
            raise
        except Exception as e:
            print(f"[OpenPhone] Excecao ao enviar via n8n: {e}")
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

    message_payload = {
        "id": str(message_id),
        "owner_id": str(owner_id),
        "conversation_id": str(data.conversation_id),
        "integration_account_id": str(integration_account_id) if integration_account_id else None,
        "identity_id": identity_id,
        "channel": channel,
        "direction": MessageDirection.outbound.value,
        "external_message_id": external_message_id,
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

    # Retornar mensagem
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
    text: str = Query(..., description="Novo texto da mensagem"),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Edita o texto de uma mensagem.
    Só pode editar mensagens outbound (enviadas pelo usuário).
    Para Telegram: chama webhook n8n que edita via worker.
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
    
    # Para Telegram: chama n8n webhook
    if msg.get("channel") == "telegram":
        external_msg_id = msg.get("external_message_id")
        if not external_msg_id or str(external_msg_id).startswith("local-"):
            raise HTTPException(status_code=400, detail="Mensagem não pode ser editada (sem ID externo)")
        
        try:
            import os
            n8n_webhook_url = os.environ.get(
                "N8N_TELEGRAM_EDIT_WEBHOOK", 
                "https://n8nwebhook.thereconquestmap.com/webhook/telegram/edit"
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
                        "message_id": str(message_id),
                        "conversation_id": msg.get("conversation_id"),
                        "external_message_id": external_msg_id,
                        "new_text": text.strip(),
                    },
                )
            
            if response.status_code == 200:
                resp_data = response.json()
                if resp_data.get("status") == "ok":
                    return {"status": "ok", "edited_at": now}
                else:
                    raise HTTPException(status_code=500, detail=resp_data.get('error', 'Erro ao editar'))
            else:
                raise HTTPException(status_code=500, detail=f"Erro n8n: {response.status_code}")
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Edit] Erro ao editar via n8n: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    # Para outros canais: atualiza apenas no banco
    db.table("messages").update({
        "text": text.strip(),
        "edited_at": now,
    }).eq("id", str(message_id)).execute()

    return {"status": "ok", "edited_at": now}


@router.delete("/{message_id}")
async def delete_message(
    message_id: UUID,
    for_everyone: bool = True,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Deleta uma mensagem (soft delete).
    Só pode deletar mensagens outbound (enviadas pelo usuário).
    Para Telegram: chama webhook n8n que deleta via worker.
    
    Args:
        for_everyone: Se True, apaga para todos (revoke). Se False, só para mim.
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
    
    # Para Telegram: chama n8n webhook
    if msg.get("channel") == "telegram":
        external_msg_id = msg.get("external_message_id")
        if not external_msg_id or str(external_msg_id).startswith("local-"):
            # Sem ID externo, apenas soft delete local
            db.table("messages").update({
                "deleted_at": now,
            }).eq("id", str(message_id)).execute()
            return {"status": "ok", "deleted_at": now}
        
        try:
            import os
            n8n_webhook_url = os.environ.get(
                "N8N_TELEGRAM_DELETE_WEBHOOK", 
                "https://n8nwebhook.thereconquestmap.com/webhook/telegram/delete"
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
                        "message_id": str(message_id),
                        "conversation_id": msg.get("conversation_id"),
                        "external_message_id": external_msg_id,
                        "revoke": for_everyone,
                    },
                )
            
            if response.status_code == 200:
                resp_data = response.json()
                if resp_data.get("status") == "ok":
                    return {"status": "ok", "deleted_at": now}
                else:
                    raise HTTPException(status_code=500, detail=resp_data.get('error', 'Erro ao deletar'))
            else:
                raise HTTPException(status_code=500, detail=f"Erro n8n: {response.status_code}")
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Delete] Erro ao deletar via n8n: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    # Para outros canais: apenas soft delete local
    db.table("messages").update({
        "deleted_at": now,
    }).eq("id", str(message_id)).execute()

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
