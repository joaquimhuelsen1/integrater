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

    # Criar mensagem
    message_id = uuid4()
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

    message_payload = {
        "id": str(message_id),
        "owner_id": str(owner_id),
        "conversation_id": str(data.conversation_id),
        "integration_account_id": str(data.integration_account_id) if data.integration_account_id else None,
        "identity_id": identity_id,
        "channel": data.channel.value if data.channel else conv.get("last_channel", "telegram"),
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
            ).eq("id", str(att_id)).execute()

    # Atualizar last_message_at da conversa
    db.table("conversations").update(
        {"last_message_at": now}
    ).eq("id", str(data.conversation_id)).execute()

    # Enviar via canal apropriado
    channel = data.channel.value if data.channel else conv.get("last_channel", "telegram")
    send_status = "sent"
    external_id = None

    if channel == "openphone_sms":
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
                # Buscar telefone do contato via contact_identities
                identity_result = db.table("contact_identities").select("value").eq(
                    "contact_id", conv["contact_id"]
                ).eq("type", "phone").limit(1).execute()

                if identity_result.data and identity_result.data[0].get("value"):
                    to_phone = identity_result.data[0]["value"]
                    api_key = decrypt(account["secrets_encrypted"])
                    from_number = account["config"]["phone_number"]

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
                        else:
                            send_status = "failed"
                    except Exception:
                        send_status = "failed"

    # Atualizar external_message_id se enviou com sucesso
    if external_id:
        db.table("messages").update({
            "external_message_id": external_id
        }).eq("id", str(message_id)).execute()

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
