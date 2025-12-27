"""
Router OpenPhone SMS - Webhook inbound/status e envio outbound (M7).
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from supabase import Client
from pydantic import BaseModel
from uuid import UUID, uuid4
from typing import Optional
import httpx
import hmac
import hashlib

from ..deps import get_supabase, get_current_user_id
from ..config import get_settings


router = APIRouter(prefix="/openphone", tags=["openphone"])


# --- Models ---

class OpenPhoneAccountCreate(BaseModel):
    """Criar conta OpenPhone."""
    label: str
    phone_number: str  # E.164 format
    api_key: str


class OpenPhoneAccountResponse(BaseModel):
    """Response conta OpenPhone."""
    id: str
    label: str
    phone_number: str
    is_active: bool
    created_at: str


class SendSMSRequest(BaseModel):
    """Request para enviar SMS."""
    to: str  # E.164 format
    content: str
    conversation_id: Optional[str] = None


class SendSMSResponse(BaseModel):
    """Response do envio SMS."""
    message_id: str
    status: str


# --- Webhook Payload Models ---

class WebhookMessageData(BaseModel):
    """Dados da mensagem no webhook."""
    id: str
    from_: str  # 'from' é palavra reservada
    to: str
    body: Optional[str] = None
    direction: str
    status: str
    phoneNumberId: str
    conversationId: Optional[str] = None
    createdAt: str
    media: Optional[list] = None

    class Config:
        populate_by_name = True
        fields = {'from_': 'from'}


# --- Helper Functions ---

def _verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verifica assinatura do webhook OpenPhone."""
    if not signature or not secret:
        return False
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)


async def _get_openphone_account(db: Client, phone_number_id: str):
    """Busca conta OpenPhone pelo phoneNumberId."""
    result = db.table("integration_accounts").select("*").eq(
        "type", "openphone"
    ).execute()

    for acc in result.data or []:
        if acc.get("config", {}).get("phone_number_id") == phone_number_id:
            return acc
    return None


async def _get_or_create_identity(db: Client, owner_id: str, phone: str, workspace_id: str = None):
    """Busca ou cria identity pelo telefone."""
    # Busca identity existente
    result = db.table("contact_identities").select(
        "id, contact_id"
    ).eq("owner_id", owner_id).eq(
        "type", "phone"
    ).eq("value", phone).execute()

    if result.data:
        return result.data[0]

    # Cria apenas identity (sem contato - igual ao Telegram)
    identity_id = str(uuid4())
    db.table("contact_identities").insert({
        "id": identity_id,
        "owner_id": owner_id,
        "contact_id": None,
        "type": "phone",
        "value": phone,
        "metadata": {
            "display_name": phone,
        },
    }).execute()

    return {"id": identity_id, "contact_id": None}


async def _get_or_create_conversation(
    db: Client, owner_id: str, identity_id: str, workspace_id: str = None
):
    """Busca ou cria conversa para a identity."""
    result = db.table("conversations").select("id").eq(
        "owner_id", owner_id
    ).eq("primary_identity_id", identity_id).limit(1).execute()

    if result.data:
        return result.data[0]["id"]

    # Cria conversa
    conv_data = {
        "owner_id": owner_id,
        "primary_identity_id": identity_id,
        "status": "open",
        "last_channel": "openphone_sms",
    }
    if workspace_id:
        conv_data["workspace_id"] = workspace_id

    new_conv = db.table("conversations").insert(conv_data).execute()

    return new_conv.data[0]["id"] if new_conv.data else None


# --- Account Management ---

@router.post("/accounts", response_model=OpenPhoneAccountResponse)
async def create_account(
    request: OpenPhoneAccountCreate,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Cadastra conta OpenPhone."""
    from ..utils.crypto import encrypt

    # Criptografa API key
    encrypted_key = encrypt(request.api_key)

    account_id = uuid4()
    result = db.table("integration_accounts").insert({
        "id": str(account_id),
        "owner_id": str(owner_id),
        "type": "openphone",
        "label": request.label,
        "config": {
            "phone_number": request.phone_number,
        },
        "secrets_encrypted": encrypted_key,
        "is_active": True,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao criar conta")

    return OpenPhoneAccountResponse(
        id=str(account_id),
        label=request.label,
        phone_number=request.phone_number,
        is_active=True,
        created_at=result.data[0]["created_at"],
    )


@router.get("/accounts")
async def list_accounts(
    workspace_id: Optional[UUID] = None,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Lista contas OpenPhone."""
    query = db.table("integration_accounts").select(
        "id, label, config, is_active, created_at"
    ).eq("owner_id", str(owner_id)).eq("type", "openphone")

    if workspace_id:
        query = query.eq("workspace_id", str(workspace_id))

    result = query.execute()

    accounts = []
    for acc in result.data or []:
        accounts.append({
            "id": acc["id"],
            "label": acc["label"],
            "phone_number": acc.get("config", {}).get("phone_number"),
            "is_active": acc["is_active"],
            "created_at": acc["created_at"],
        })

    return accounts


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Remove conta OpenPhone."""
    db.table("integration_accounts").delete().eq(
        "id", str(account_id)
    ).eq("owner_id", str(owner_id)).execute()

    return {"success": True}


# --- Send SMS ---

@router.post("/send", response_model=SendSMSResponse)
async def send_sms(
    request: SendSMSRequest,
    account_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Envia SMS via OpenPhone."""
    from ..utils.crypto import decrypt

    # Busca conta
    result = db.table("integration_accounts").select("*").eq(
        "id", str(account_id)
    ).eq("owner_id", str(owner_id)).eq("type", "openphone").single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Conta não encontrada")

    account = result.data
    api_key = decrypt(account["secrets_encrypted"])
    from_number = account["config"]["phone_number"]

    # Envia via API OpenPhone
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.openphone.com/v1/messages",
            headers={
                "Authorization": api_key,
                "Content-Type": "application/json",
            },
            json={
                "from": from_number,
                "to": [request.to],
                "content": request.content,
            },
        )

    if response.status_code not in (200, 201, 202):
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Erro OpenPhone: {response.text}"
        )

    data = response.json().get("data", {})
    message_id = data.get("id", str(uuid4()))

    # Salva mensagem no banco
    if request.conversation_id:
        db.table("messages").insert({
            "conversation_id": request.conversation_id,
            "direction": "outbound",
            "channel": "sms",
            "text": request.content,
            "external_id": message_id,
            "integration_account_id": str(account_id),
            "metadata": {"openphone_status": data.get("status", "queued")},
        }).execute()

    return SendSMSResponse(
        message_id=message_id,
        status=data.get("status", "queued"),
    )


# --- Webhooks ---

@router.post("/webhook/inbound")
async def webhook_inbound(
    request: Request,
    db: Client = Depends(get_supabase),
    x_openphone_signature: Optional[str] = Header(None),
):
    """
    Webhook para SMS recebido (message.received).
    Cria contato/conversa se necessário e salva mensagem.
    """
    payload = await request.body()
    data = await request.json()

    # DEBUG: Log completo do payload
    print(f"[OpenPhone] Webhook recebido: {data}")

    event_type = data.get("type")
    print(f"[OpenPhone] Event type: {event_type}")

    if event_type != "message.received":
        print(f"[OpenPhone] Ignorando evento: {event_type}")
        return {"status": "ignored", "reason": f"event type: {event_type}"}

    msg = data.get("data", {}).get("object", {})
    if not msg:
        print(f"[OpenPhone] Sem dados de mensagem no payload")
        return {"status": "ignored", "reason": "no message data"}

    phone_number_id = msg.get("phoneNumberId")
    from_phone = msg.get("from")
    body = msg.get("body", "")
    external_id = msg.get("id")
    media = msg.get("media", [])
    to_phone = msg.get("to")

    print(f"[OpenPhone] Mensagem: from={from_phone}, to={to_phone}, body={body[:50] if body else 'vazio'}")
    print(f"[OpenPhone] phone_number_id={phone_number_id}, external_id={external_id}")

    # Busca conta OpenPhone
    account = await _get_openphone_account(db, phone_number_id)
    print(f"[OpenPhone] Conta por phone_number_id: {account}")
    if not account:
        # Tenta buscar por número
        print(f"[OpenPhone] Buscando por phone_number: {to_phone}")
        result = db.table("integration_accounts").select("*").eq(
            "type", "openphone"
        ).execute()

        print(f"[OpenPhone] Contas encontradas: {len(result.data or [])} ")
        for acc in result.data or []:
            acc_phone = acc.get("config", {}).get("phone_number")
            print(f"[OpenPhone] Comparando: {acc_phone} == {to_phone}")
            if acc_phone == to_phone:
                account = acc
                print(f"[OpenPhone] Match encontrado!")
                break

    if not account:
        print(f"[OpenPhone] ERRO: Conta não encontrada para {to_phone}")
        return {"status": "ignored", "reason": "account not found"}

    owner_id = account["owner_id"]
    account_id = account["id"]
    workspace_id = account.get("workspace_id")

    # Busca/cria identity
    identity = await _get_or_create_identity(db, owner_id, from_phone, workspace_id)
    if not identity:
        raise HTTPException(status_code=500, detail="Erro ao criar identity")

    identity_id = identity["id"]

    # Busca/cria conversa
    conversation_id = await _get_or_create_conversation(
        db, owner_id, identity_id, workspace_id
    )
    if not conversation_id:
        raise HTTPException(status_code=500, detail="Erro ao criar conversa")

    # Salva mensagem
    message_data = {
        "conversation_id": conversation_id,
        "identity_id": identity_id,
        "direction": "inbound",
        "channel": "openphone_sms",
        "text": body,
        "external_message_id": external_id,
        "integration_account_id": account_id,
        "owner_id": owner_id,
        "sent_at": msg.get("createdAt"),
    }

    # Se tem mídia, adiciona no payload
    if media:
        message_data["payload"] = {"media": media}

    db.table("messages").insert(message_data).execute()

    # Atualiza last_message_at da conversa
    db.table("conversations").update({
        "last_message_at": msg.get("createdAt"),
        "status": "open",
    }).eq("id", conversation_id).execute()

    return {"status": "processed", "conversation_id": conversation_id}


@router.post("/webhook/status")
async def webhook_status(
    request: Request,
    db: Client = Depends(get_supabase),
):
    """
    Webhook para status de entrega (message.delivered).
    Atualiza status da mensagem no banco.
    """
    data = await request.json()
    print(f"[OpenPhone] Status webhook: {data}")

    event_type = data.get("type")
    if event_type != "message.delivered":
        print(f"[OpenPhone] Status ignorado: {event_type}")
        return {"status": "ignored", "reason": f"event type: {event_type}"}

    msg = data.get("data", {}).get("object", {})
    external_id = msg.get("id")
    status = msg.get("status", "delivered")

    if not external_id:
        return {"status": "ignored", "reason": "no message id"}

    # Atualiza status da mensagem (coluna correta: external_message_id)
    print(f"[OpenPhone] Atualizando status: {external_id} -> {status}")
    db.table("messages").update({
        "metadata": {"openphone_status": status},
    }).eq("external_message_id", external_id).execute()

    return {"status": "updated", "message_status": status}
