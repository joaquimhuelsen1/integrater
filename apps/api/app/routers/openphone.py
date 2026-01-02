"""
Router OpenPhone SMS - Webhook inbound/status e envio outbound (M7).

SEGURANÇA:
- Webhooks validam assinatura HMAC-SHA256
- Inputs validados com regex E.164
- Limite de tamanho em conteúdo SMS
"""

import logging
import re
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from supabase import Client
from pydantic import BaseModel, field_validator, Field
from uuid import UUID, uuid4
from typing import Optional
import httpx
import hmac
import hashlib

from ..deps import get_supabase, get_current_user_id
from ..config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/openphone", tags=["openphone"])

# Regex para validação E.164: +[código país][número] (8-15 dígitos total)
E164_REGEX = re.compile(r'^\+[1-9]\d{7,14}$')


def validate_e164(phone: str) -> str:
    """Valida e normaliza número de telefone E.164."""
    phone = phone.strip()
    if not E164_REGEX.match(phone):
        raise ValueError(f"Telefone inválido. Use formato E.164: +5511999999999")
    return phone


# --- Models ---

class OpenPhoneAccountCreate(BaseModel):
    """Criar conta OpenPhone."""
    label: str = Field(..., min_length=1, max_length=100)
    phone_number: str  # E.164 format
    api_key: str = Field(..., min_length=10)
    
    @field_validator('phone_number')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return validate_e164(v)


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
    content: str = Field(..., min_length=1, max_length=1600)  # Limite SMS
    conversation_id: Optional[str] = None
    
    @field_validator('to')
    @classmethod
    def validate_to(cls, v: str) -> str:
        return validate_e164(v)


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

def _verify_webhook_signature(payload: bytes, signature: str | None, webhook_type: str) -> bool:
    """
    Verifica assinatura HMAC-SHA256 do webhook OpenPhone.
    
    SEGURANÇA: Usa hmac.compare_digest para evitar timing attacks.
    
    Args:
        payload: Corpo da requisição em bytes
        signature: Header x-openphone-signature
        webhook_type: "inbound" ou "status"
    
    Returns:
        True se válida, False se inválida ou sem secret configurado
    """
    settings = get_settings()
    
    # Seleciona secret correto baseado no tipo de webhook
    if webhook_type == "inbound":
        secret = settings.openphone_webhook_secret_inbound
    else:
        secret = settings.openphone_webhook_secret_status
    
    # Se não tem secret configurado, loga warning mas permite (para migração)
    if not secret:
        logger.warning(f"OPENPHONE_WEBHOOK_SECRET_{webhook_type.upper()} não configurado - webhook não validado!")
        return True  # Permite durante migração, mas loga warning
    
    if not signature:
        logger.warning("Webhook recebido sem assinatura")
        return False
    
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    is_valid = hmac.compare_digest(signature.lower(), expected.lower())
    
    if not is_valid:
        logger.warning(f"Assinatura de webhook {webhook_type} inválida")
    
    return is_valid


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
    x_openphone_signature: Optional[str] = Header(None, alias="X-Openphone-Signature"),
):
    """
    Webhook para SMS recebido (message.received).
    
    SEGURANÇA:
    - Valida assinatura HMAC-SHA256 do webhook
    - Cria contato/conversa se necessário e salva mensagem
    """
    payload = await request.body()
    
    # SEGURANÇA: Validar assinatura do webhook
    if not _verify_webhook_signature(payload, x_openphone_signature, "inbound"):
        logger.warning("Webhook inbound rejeitado: assinatura inválida")
        raise HTTPException(status_code=401, detail="Assinatura inválida")
    
    data = await request.json()
    
    logger.debug(f"Webhook inbound recebido: type={data.get('type')}")

    event_type = data.get("type")

    if event_type != "message.received":
        logger.debug(f"Ignorando evento: {event_type}")
        return {"status": "ignored", "reason": f"event type: {event_type}"}

    msg = data.get("data", {}).get("object", {})
    if not msg:
        logger.warning("Webhook sem dados de mensagem")
        return {"status": "ignored", "reason": "no message data"}

    phone_number_id = msg.get("phoneNumberId")
    from_phone = msg.get("from")
    body = msg.get("body", "")
    external_id = msg.get("id")
    media = msg.get("media", [])
    to_phone = msg.get("to")

    logger.info(f"SMS recebido: from={from_phone}, to={to_phone}")

    # Busca conta OpenPhone
    account = await _get_openphone_account(db, phone_number_id)
    if not account:
        # Tenta buscar por número
        result = db.table("integration_accounts").select("*").eq(
            "type", "openphone"
        ).execute()

        for acc in result.data or []:
            acc_phone = acc.get("config", {}).get("phone_number")
            if acc_phone == to_phone:
                account = acc
                break

    if not account:
        logger.warning(f"Conta não encontrada para {to_phone}")
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

    logger.info(f"SMS processado: conversation={conversation_id}")
    return {"status": "processed", "conversation_id": conversation_id}


@router.post("/webhook/status")
async def webhook_status(
    request: Request,
    db: Client = Depends(get_supabase),
    x_openphone_signature: Optional[str] = Header(None, alias="X-Openphone-Signature"),
):
    """
    Webhook para status de entrega (message.delivered).
    
    SEGURANÇA:
    - Valida assinatura HMAC-SHA256 do webhook
    - Cria conversa/mensagem para outgoing e atualiza status
    """
    try:
        payload = await request.body()
        
        # SEGURANÇA: Validar assinatura do webhook
        if not _verify_webhook_signature(payload, x_openphone_signature, "status"):
            logger.warning("Webhook status rejeitado: assinatura inválida")
            raise HTTPException(status_code=401, detail="Assinatura inválida")
        
        data = await request.json()
        logger.debug(f"Webhook status recebido: type={data.get('type')}")

        event_type = data.get("type")
        if event_type != "message.delivered":
            return {"status": "ignored", "reason": f"event type: {event_type}"}

        msg = data.get("data", {}).get("object", {})
        external_id = msg.get("id")
        status = msg.get("status", "delivered")
        direction = msg.get("direction")
        from_phone = msg.get("from")
        to_phone = msg.get("to")
        body = msg.get("body", "")
        phone_number_id = msg.get("phoneNumberId")

        if not external_id:
            return {"status": "ignored", "reason": "no message id"}

        logger.info(f"Status update: {external_id} -> {status}")

        # Se é outgoing, cria conversa e mensagem
        if direction == "outgoing":
            # Busca conta OpenPhone pelo phoneNumberId ou from
            account = await _get_openphone_account(db, phone_number_id)
            if not account:
                result = db.table("integration_accounts").select("*").eq(
                    "type", "openphone"
                ).execute()
                for acc in result.data or []:
                    if acc.get("config", {}).get("phone_number") == from_phone:
                        account = acc
                        break

            if not account:
                logger.warning(f"Conta não encontrada para {from_phone}")
                return {"status": "ignored", "reason": "account not found"}

            owner_id = account["owner_id"]
            account_id = account["id"]
            workspace_id = account.get("workspace_id")

            # Verifica se mensagem já existe
            existing = db.table("messages").select("id").eq(
                "external_message_id", external_id
            ).execute()
            if existing.data:
                logger.debug(f"Mensagem já existe: {external_id}")
                return {"status": "ok", "message_status": status}

            # Cria identity para o destinatário (to_phone)
            identity = await _get_or_create_identity(db, owner_id, to_phone, workspace_id)
            if not identity:
                return {"status": "error", "reason": "failed to create identity"}

            identity_id = identity["id"]

            # Cria/busca conversa
            conversation_id = await _get_or_create_conversation(
                db, owner_id, identity_id, workspace_id
            )
            if not conversation_id:
                return {"status": "error", "reason": "failed to create conversation"}

            # Salva mensagem outgoing
            message_data = {
                "conversation_id": conversation_id,
                "identity_id": identity_id,
                "direction": "outbound",
                "channel": "openphone_sms",
                "text": body,
                "external_message_id": external_id,
                "integration_account_id": account_id,
                "owner_id": owner_id,
                "sent_at": msg.get("createdAt"),
            }
            db.table("messages").insert(message_data).execute()

            # Atualiza conversa
            db.table("conversations").update({
                "last_message_at": msg.get("createdAt"),
            }).eq("id", conversation_id).execute()

            logger.info(f"Mensagem outgoing criada: {conversation_id}")
            return {"status": "created", "conversation_id": conversation_id}

        return {"status": "ok", "message_status": status}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro no webhook status: {e}", exc_info=True)
        return {"status": "ok"}
