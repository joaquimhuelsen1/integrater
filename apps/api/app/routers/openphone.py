"""
Router OpenPhone SMS - Webhook inbound/status e envio outbound (M7).

ARQUITETURA COM n8n:
- Webhooks recebem eventos do OpenPhone, validam assinatura, encaminham para n8n
- n8n orquestra toda a logica de negocio (criar identity, conversa, inserir mensagens)
- Envio via messages.py que chama n8n

SEGURANCA:
- Webhooks validam assinatura HMAC-SHA256
- Inputs validados com regex E.164
- Limite de tamanho em conteudo SMS

SYNC CONTATOS:
- POST /openphone/contacts/sync busca contatos do OpenPhone
- Atualiza contact_identities com nomes dos contatos
"""

import logging
import os
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
from ..utils.crypto import encrypt, decrypt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/openphone", tags=["openphone"])

# Regex para validacao E.164: +[codigo pais][numero] (8-15 digitos total)
E164_REGEX = re.compile(r'^\+[1-9]\d{7,14}$')

# n8n Webhooks
N8N_WEBHOOK_OPENPHONE_INBOUND = os.environ.get("N8N_WEBHOOK_OPENPHONE_INBOUND", "")
N8N_API_KEY = os.environ.get("N8N_API_KEY", "")


def validate_e164(phone: str) -> str:
    """Valida e normaliza numero de telefone E.164."""
    phone = phone.strip()
    if not E164_REGEX.match(phone):
        raise ValueError(f"Telefone invalido. Use formato E.164: +5511999999999")
    return phone


def normalize_phone_e164(value: str) -> str:
    """Normaliza telefone para formato E.164 (foco US)."""
    if not value:
        raise ValueError("Telefone nao pode ser vazio")

    # Remove espacos, hifens, parenteses, pontos
    phone = re.sub(r"[\s\-\(\)\.]", "", value)

    # Se ja tem + e parece valido, processar
    had_plus = phone.startswith("+")
    if had_plus:
        phone = phone[1:]

    # Remove caracteres nao numericos
    digits = re.sub(r"\D", "", phone)

    # Detecta pais (foco US)
    if len(digits) == 10:
        # EUA 10 digitos sem codigo de pais
        return "+1" + digits
    elif len(digits) == 11 and digits.startswith("1"):
        # EUA/Canada: 1 + area(3) + numero(7)
        return "+" + digits
    elif digits.startswith("55") and len(digits) in (12, 13):
        # Brasil: 55 + DDD(2) + numero(8-9)
        return "+" + digits
    elif had_plus and 8 <= len(digits) <= 15:
        # Tinha + e parece E.164 valido
        return "+" + digits
    elif 8 <= len(digits) <= 15:
        # Fallback: assume que precisa de +
        return "+" + digits
    else:
        raise ValueError(f"Telefone invalido: {value}")


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


class ContactSyncResponse(BaseModel):
    """Response da sincronização de contatos."""
    synced: int
    skipped: int
    errors: int


# --- Helper Functions ---

def _verify_webhook_signature(payload: bytes, signature: str | None, webhook_type: str) -> bool:
    """
    Verifica assinatura HMAC-SHA256 do webhook OpenPhone.
    
    SEGURANCA: Usa hmac.compare_digest para evitar timing attacks.
    """
    settings = get_settings()
    
    if webhook_type == "inbound":
        secret = settings.openphone_webhook_secret_inbound
    else:
        secret = settings.openphone_webhook_secret_status
    
    if not secret:
        logger.warning(f"OPENPHONE_WEBHOOK_SECRET_{webhook_type.upper()} nao configurado - webhook nao validado!")
        return True
    
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
        logger.warning(f"Assinatura de webhook {webhook_type} invalida")
    
    return is_valid


async def _get_openphone_account(db: Client, phone_number_id: str = None, phone_number: str = None):
    """Busca conta OpenPhone pelo phoneNumberId ou phone_number."""
    result = db.table("integration_accounts").select("*").eq(
        "type", "openphone"
    ).execute()

    for acc in result.data or []:
        config = acc.get("config", {})
        if phone_number_id and config.get("phone_number_id") == phone_number_id:
            return acc
        if phone_number and config.get("phone_number") == phone_number:
            return acc
    return None


async def _send_to_n8n(payload: dict) -> dict | None:
    """Envia payload para webhook do n8n."""
    if not N8N_WEBHOOK_OPENPHONE_INBOUND:
        logger.warning("[WEBHOOK] URL nao configurada, pulando envio")
        return None
        
    if not N8N_API_KEY:
        logger.warning("[WEBHOOK] API Key nao configurada")
        return None
    
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": N8N_API_KEY,
    }
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(N8N_WEBHOOK_OPENPHONE_INBOUND, json=payload, headers=headers)
            
            if response.status_code == 200:
                logger.info(f"[WEBHOOK] Enviado com sucesso para n8n")
                try:
                    return response.json()
                except Exception:
                    return {"status": "ok"}
            else:
                logger.error(f"[WEBHOOK] Erro {response.status_code}: {response.text}")
                return None
                
    except httpx.TimeoutException:
        logger.error(f"[WEBHOOK] Timeout ao chamar n8n")
        return None
    except Exception as e:
        logger.error(f"[WEBHOOK] Erro ao chamar n8n: {e}")
        return None


# --- Account Management ---

@router.post("/accounts", response_model=OpenPhoneAccountResponse)
async def create_account(
    request: OpenPhoneAccountCreate,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Cadastra conta OpenPhone."""
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


# --- Contacts Sync ---

@router.post("/contacts/sync", response_model=ContactSyncResponse)
async def sync_contacts(
    account_id: UUID,
    workspace_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """
    Sincroniza contatos do OpenPhone para contact_identities.
    
    Busca todos os contatos da conta OpenPhone e atualiza metadata.display_name
    nas identidades de telefone correspondentes.
    """
    # 1. Buscar conta OpenPhone e validar ownership
    result = db.table("integration_accounts").select("*").eq(
        "id", str(account_id)
    ).eq("owner_id", str(owner_id)).eq("type", "openphone").single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Conta OpenPhone nao encontrada")

    account = result.data
    api_key = decrypt(account["secrets_encrypted"])

    # 2. Buscar contatos do OpenPhone
    synced = 0
    skipped = 0
    errors = 0

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                "https://api.openphone.com/v1/contacts",
                headers={
                    "Authorization": api_key,
                    "Content-Type": "application/json",
                },
            )

        if response.status_code != 200:
            logger.error(f"Erro ao buscar contatos OpenPhone: {response.status_code} - {response.text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Erro OpenPhone: {response.text}"
            )

        contacts_data = response.json().get("data", [])
        logger.info(f"OpenPhone retornou {len(contacts_data)} contatos")

        # 3. Processar cada contato
        for contact in contacts_data:
            try:
                default_fields = contact.get("defaultFields", {})
                first_name = default_fields.get("firstName", "")
                last_name = default_fields.get("lastName", "")
                company = default_fields.get("company", "")
                phone_numbers = default_fields.get("phoneNumbers", [])

                # Montar display_name: nome completo ou empresa
                display_name = f"{first_name} {last_name}".strip()
                if not display_name and company:
                    display_name = company
                
                if not display_name:
                    skipped += 1
                    continue

                if not phone_numbers:
                    skipped += 1
                    continue

                # Atualizar cada número de telefone
                for phone_obj in phone_numbers:
                    phone_value = phone_obj.get("value", "")
                    if not phone_value:
                        continue

                    # Normalizar telefone (garantir formato E.164)
                    phone_normalized = phone_value.strip()
                    if not phone_normalized.startswith("+"):
                        phone_normalized = f"+{phone_normalized}"

                    # Buscar identity existente
                    identity_result = db.table("contact_identities").select("id, metadata").eq(
                        "workspace_id", str(workspace_id)
                    ).eq("type", "phone").eq("value", phone_normalized).execute()

                    if identity_result.data:
                        # Atualizar metadata com display_name
                        identity = identity_result.data[0]
                        metadata = identity.get("metadata", {}) or {}
                        metadata["display_name"] = display_name
                        if company:
                            metadata["company"] = company

                        db.table("contact_identities").update({
                            "metadata": metadata
                        }).eq("id", identity["id"]).execute()

                        synced += 1
                        logger.debug(f"Atualizado: {phone_normalized} -> {display_name}")
                    else:
                        # Identity não existe ainda, skip
                        skipped += 1

            except Exception as e:
                logger.error(f"Erro ao processar contato: {e}")
                errors += 1

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout ao conectar com OpenPhone")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao sincronizar contatos: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno: {str(e)}")

    logger.info(f"Sync concluido: {synced} sincronizados, {skipped} ignorados, {errors} erros")
    
    return ContactSyncResponse(
        synced=synced,
        skipped=skipped,
        errors=errors,
    )


# --- Send SMS (mantido para compatibilidade - use messages.py para envio via n8n) ---

@router.post("/send", response_model=SendSMSResponse)
async def send_sms(
    request: SendSMSRequest,
    account_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Envia SMS via OpenPhone (direto - para uso administrativo)."""
    result = db.table("integration_accounts").select("*").eq(
        "id", str(account_id)
    ).eq("owner_id", str(owner_id)).eq("type", "openphone").single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Conta nao encontrada")

    account = result.data
    api_key = decrypt(account["secrets_encrypted"])
    from_number = account["config"]["phone_number"]

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

    return SendSMSResponse(
        message_id=message_id,
        status=data.get("status", "queued"),
    )


# --- Endpoint interno para n8n enviar SMS ---

class InternalSendSMSRequest(BaseModel):
    """Request interno para n8n enviar SMS."""
    conversation_id: str
    text: str = Field(..., min_length=1, max_length=1600)
    message_id: Optional[str] = None  # ID do frontend para evitar duplicata


class InternalSendSMSResponse(BaseModel):
    """Response interno para n8n."""
    status: str
    external_id: str
    from_phone: str
    to_phone: str


@router.post("/internal/send", response_model=InternalSendSMSResponse)
async def internal_send_sms(
    request: InternalSendSMSRequest,
    db: Client = Depends(get_supabase),
    x_api_key: Optional[str] = Header(None, alias="X-API-KEY"),
):
    """
    Endpoint interno para n8n enviar SMS.
    
    Descriptografa a API key do OpenPhone e envia a mensagem.
    Autenticado via X-API-KEY (mesmo do n8n webhook).
    """
    # Validar API key do n8n
    expected_key = N8N_API_KEY
    if not expected_key or x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="API key invalida")
    
    # Buscar conversa
    conv_result = db.table("conversations").select(
        "id, owner_id, workspace_id, primary_identity_id"
    ).eq("id", request.conversation_id).single().execute()
    
    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversa nao encontrada")
    
    conv = conv_result.data
    
    # Buscar identity (telefone destino)
    identity_result = db.table("contact_identities").select(
        "value"
    ).eq("id", conv["primary_identity_id"]).single().execute()
    
    if not identity_result.data:
        raise HTTPException(status_code=404, detail="Identity nao encontrada")

    # Normaliza telefone para formato E.164
    to_phone = normalize_phone_e164(identity_result.data["value"])

    # Buscar conta OpenPhone
    account_result = db.table("integration_accounts").select(
        "id, config, secrets_encrypted"
    ).eq("workspace_id", conv["workspace_id"]).eq(
        "type", "openphone"
    ).eq("is_active", True).limit(1).execute()
    
    if not account_result.data:
        raise HTTPException(status_code=404, detail="Conta OpenPhone nao encontrada")
    
    account = account_result.data[0]
    from_phone = account["config"]["phone_number"]
    secrets_encrypted = account["secrets_encrypted"]
    account_id = account["id"]
    
    # Descriptografar API key
    api_key = decrypt(secrets_encrypted)
    
    # Enviar SMS via OpenPhone API
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.openphone.com/v1/messages",
            headers={
                "Authorization": api_key,
                "Content-Type": "application/json",
            },
            json={
                "from": from_phone,
                "to": [to_phone],
                "content": request.text,
            },
        )
    
    if response.status_code not in (200, 201, 202):
        logger.error(f"Erro OpenPhone API: {response.status_code} {response.text}")
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Erro OpenPhone: {response.text}"
        )
    
    resp_data = response.json().get("data", {})
    external_id = resp_data.get("id", str(uuid4()))
    
    logger.info(f"SMS enviado: {from_phone} -> {to_phone}, external_id={external_id}")
    
    return InternalSendSMSResponse(
        status="ok",
        external_id=external_id,
        from_phone=from_phone,
        to_phone=to_phone,
    )


# --- Webhooks - Encaminham para n8n ---

@router.post("/webhook/inbound")
async def webhook_inbound(
    request: Request,
    db: Client = Depends(get_supabase),
    x_openphone_signature: Optional[str] = Header(None, alias="X-Openphone-Signature"),
):
    """
    Webhook para SMS recebido (message.received).
    
    Valida assinatura e encaminha para n8n processar.
    """
    payload = await request.body()
    
    # Validar assinatura
    if not _verify_webhook_signature(payload, x_openphone_signature, "inbound"):
        logger.warning("Webhook inbound rejeitado: assinatura invalida")
        raise HTTPException(status_code=401, detail="Assinatura invalida")
    
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
    to_phone = msg.get("to")
    body = msg.get("body", "")
    external_id = msg.get("id")
    media = msg.get("media", [])
    created_at = msg.get("createdAt")

    logger.info(f"SMS recebido: from={from_phone}, to={to_phone}")

    # Busca conta OpenPhone para obter owner_id e workspace_id
    account = await _get_openphone_account(db, phone_number_id=phone_number_id, phone_number=to_phone)
    
    if not account:
        logger.warning(f"Conta nao encontrada para {to_phone}")
        return {"status": "ignored", "reason": "account not found"}

    owner_id = account["owner_id"]
    account_id = account["id"]
    workspace_id = account.get("workspace_id")

    # Encaminha para n8n
    n8n_payload = {
        "event": "inbound",
        "account_id": account_id,
        "owner_id": owner_id,
        "workspace_id": workspace_id,
        "from_phone": from_phone,
        "to_phone": to_phone,
        "body": body,
        "external_id": external_id,
        "media": media,
        "timestamp": created_at,
    }

    result = await _send_to_n8n(n8n_payload)
    
    if result and result.get("status") == "ok":
        logger.info(f"SMS processado via n8n: conversation={result.get('conversation_id')}")
        return {"status": "processed", "conversation_id": result.get("conversation_id")}
    else:
        logger.error("Erro ao processar SMS via n8n")
        return {"status": "error", "reason": "n8n processing failed"}


@router.post("/webhook/status")
async def webhook_status(
    request: Request,
    db: Client = Depends(get_supabase),
    x_openphone_signature: Optional[str] = Header(None, alias="X-Openphone-Signature"),
):
    """
    Webhook para status de entrega (message.delivered).
    
    Valida assinatura e encaminha para n8n processar.
    """
    try:
        payload = await request.body()
        
        # Validar assinatura
        if not _verify_webhook_signature(payload, x_openphone_signature, "status"):
            logger.warning("Webhook status rejeitado: assinatura invalida")
            raise HTTPException(status_code=401, detail="Assinatura invalida")
        
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
        created_at = msg.get("createdAt")

        if not external_id:
            return {"status": "ignored", "reason": "no message id"}

        logger.info(f"Status update: {external_id} -> {status}")

        # Para outgoing, busca conta e encaminha para n8n
        if direction == "outgoing":
            account = await _get_openphone_account(db, phone_number_id=phone_number_id, phone_number=from_phone)
            
            if not account:
                logger.warning(f"Conta nao encontrada para {from_phone}")
                return {"status": "ignored", "reason": "account not found"}

            owner_id = account["owner_id"]
            account_id = account["id"]
            workspace_id = account.get("workspace_id")

            # Encaminha para n8n
            n8n_payload = {
                "event": "outbound",
                "account_id": account_id,
                "owner_id": owner_id,
                "workspace_id": workspace_id,
                "from_phone": from_phone,
                "to_phone": to_phone,
                "body": body,
                "external_id": external_id,
                "status": status,
                "timestamp": created_at,
            }

            result = await _send_to_n8n(n8n_payload)
            
            if result and result.get("status") == "ok":
                logger.info(f"Mensagem outgoing processada via n8n")
                return {"status": "processed", "conversation_id": result.get("conversation_id")}

        return {"status": "ok", "message_status": status}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro no webhook status: {e}", exc_info=True)
        return {"status": "ok"}
