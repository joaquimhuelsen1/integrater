"""
Router Email IMAP/SMTP - Gerenciamento de contas e envio (M8).

SEGURANÇA:
- Validação de email, hostname e portas
- Senhas criptografadas com AES-256-GCM
- Logging estruturado sem dados sensíveis
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from pydantic import BaseModel, Field, field_validator
from uuid import UUID, uuid4
from typing import Optional, Literal
from datetime import datetime, timezone, timedelta
import email
from email.utils import parsedate_to_datetime

from ..deps import get_supabase, get_current_user_id
from ..utils.crypto import encrypt, decrypt
from ..utils.validators import validate_email, validate_hostname, validate_port

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])


# --- Models ---

class EmailAccountCreate(BaseModel):
    """Criar conta Email."""
    label: str = Field(..., min_length=1, max_length=100)
    email: str
    password: str = Field(..., min_length=1)
    workspace_id: UUID
    imap_host: str = "imap.gmail.com"
    imap_port: int = 993
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    
    @field_validator('email')
    @classmethod
    def validate_email_field(cls, v: str) -> str:
        return validate_email(v)
    
    @field_validator('imap_host', 'smtp_host')
    @classmethod
    def validate_host(cls, v: str) -> str:
        return validate_hostname(v)
    
    @field_validator('imap_port', 'smtp_port')
    @classmethod
    def validate_port_field(cls, v: int) -> int:
        return validate_port(v)


class EmailAccountResponse(BaseModel):
    """Response conta Email."""
    id: str
    label: str
    email: str
    imap_host: str
    smtp_host: str
    is_active: bool
    created_at: str
    last_error: Optional[str] = None


# --- Account Management ---

@router.post("/accounts", response_model=EmailAccountResponse)
async def create_account(
    request: EmailAccountCreate,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Cadastra conta Email IMAP/SMTP."""
    # Criptografa senha
    encrypted_password = encrypt(request.password)

    account_id = uuid4()
    result = db.table("integration_accounts").insert({
        "id": str(account_id),
        "owner_id": str(owner_id),
        "workspace_id": str(request.workspace_id),
        "type": "email_imap_smtp",
        "label": request.label,
        "config": {
            "email": request.email,
            "imap_host": request.imap_host,
            "imap_port": request.imap_port,
            "smtp_host": request.smtp_host,
            "smtp_port": request.smtp_port,
        },
        "secrets_encrypted": encrypted_password,
        "is_active": True,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao criar conta")

    return EmailAccountResponse(
        id=str(account_id),
        label=request.label,
        email=request.email,
        imap_host=request.imap_host,
        smtp_host=request.smtp_host,
        is_active=True,
        created_at=result.data[0]["created_at"],
    )


@router.get("/accounts")
async def list_accounts(
    workspace_id: Optional[UUID] = None,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Lista contas Email."""
    query = db.table("integration_accounts").select(
        "id, label, config, is_active, created_at, last_error"
    ).eq("owner_id", str(owner_id)).eq("type", "email_imap_smtp")

    if workspace_id:
        query = query.eq("workspace_id", str(workspace_id))

    result = query.execute()

    accounts = []
    for acc in result.data or []:
        accounts.append({
            "id": acc["id"],
            "label": acc["label"],
            "email": acc.get("config", {}).get("email"),
            "imap_host": acc.get("config", {}).get("imap_host"),
            "smtp_host": acc.get("config", {}).get("smtp_host"),
            "is_active": acc["is_active"],
            "created_at": acc["created_at"],
            "last_error": acc.get("last_error"),
        })

    return accounts


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Remove conta Email. Mensagens são preservadas (integration_account_id fica NULL)."""
    # Remove worker heartbeats
    db.table("worker_heartbeats").delete().eq(
        "integration_account_id", str(account_id)
    ).execute()

    # Deleta conta (FK SET NULL preserva mensagens)
    db.table("integration_accounts").delete().eq(
        "id", str(account_id)
    ).eq("owner_id", str(owner_id)).execute()

    return {"success": True}


# Endpoint de delete de mensagens removido para proteger dados
# Mensagens são valiosas e nunca devem ser deletadas em massa


@router.post("/accounts/{account_id}/test")
async def test_account(
    account_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Testa conexao da conta Email."""
    from ..utils.crypto import decrypt
    import smtplib
    from imapclient import IMAPClient

    # Busca conta
    result = db.table("integration_accounts").select("*").eq(
        "id", str(account_id)
    ).eq("owner_id", str(owner_id)).eq("type", "email_imap_smtp").single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Conta nao encontrada")

    account = result.data
    password = decrypt(account["secrets_encrypted"])
    config = account["config"]

    errors = []

    # Testa IMAP
    try:
        client = IMAPClient(config["imap_host"], port=config["imap_port"], ssl=True)
        client.login(config["email"], password)
        client.logout()
    except Exception as e:
        errors.append(f"IMAP: {str(e)}")

    # Testa SMTP
    try:
        smtp_port = config["smtp_port"]
        if smtp_port == 465:
            # SSL implicito (porta 465)
            with smtplib.SMTP_SSL(config["smtp_host"], smtp_port) as server:
                server.login(config["email"], password)
        else:
            # STARTTLS (porta 587)
            with smtplib.SMTP(config["smtp_host"], smtp_port) as server:
                server.starttls()
                server.login(config["email"], password)
    except Exception as e:
        errors.append(f"SMTP: {str(e)}")

    if errors:
        # Atualiza erro na conta
        db.table("integration_accounts").update({
            "last_error": "; ".join(errors),
        }).eq("id", str(account_id)).execute()

        raise HTTPException(status_code=400, detail="; ".join(errors))

    # Limpa erro se sucesso
    db.table("integration_accounts").update({
        "last_error": None,
    }).eq("id", str(account_id)).execute()

    return {"success": True, "message": "Conexao IMAP e SMTP OK"}


# --- Sync History ---

class EmailSyncRequest(BaseModel):
    """Request para sync de emails."""
    account_id: UUID
    workspace_id: UUID
    period: Literal["1d", "3d", "7d"] = "1d"


class EmailSyncResponse(BaseModel):
    """Response do sync de emails."""
    emails_found: int
    emails_synced: int
    conversations_created: int


PERIOD_DAYS = {
    "1d": 1,
    "3d": 3,
    "7d": 7,
}


@router.post("/sync-history", response_model=EmailSyncResponse)
async def sync_email_history(
    request: EmailSyncRequest,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Sincroniza historico de emails via IMAP."""
    from imapclient import IMAPClient

    # Busca conta
    result = db.table("integration_accounts").select("*").eq(
        "id", str(request.account_id)
    ).eq("owner_id", str(owner_id)).eq("type", "email_imap_smtp").single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Conta nao encontrada")

    account = result.data
    password = decrypt(account["secrets_encrypted"])
    config = account["config"]
    workspace_id = str(request.workspace_id)

    # Calcula data de corte
    days = PERIOD_DAYS.get(request.period, 1)
    since_date = (datetime.now(timezone.utc) - timedelta(days=days)).date()

    print(f"[EMAIL SYNC] Conectando IMAP {config['email']}...")

    emails_found = 0
    emails_synced = 0
    conversations_created = 0

    try:
        client = IMAPClient(config["imap_host"], port=config["imap_port"], ssl=True)
        client.login(config["email"], password)

        # Seleciona INBOX
        client.select_folder("INBOX")

        # Busca emails desde a data
        messages = client.search(["SINCE", since_date])
        emails_found = len(messages)
        print(f"[EMAIL SYNC] Encontrados {emails_found} emails desde {since_date}")

        # Processa cada email
        for uid in messages:
            try:
                # Busca dados do email
                raw = client.fetch([uid], ["RFC822", "INTERNALDATE"])
                if uid not in raw:
                    continue

                msg_data = raw[uid]
                msg_bytes = msg_data[b"RFC822"]
                internal_date = msg_data[b"INTERNALDATE"]

                # Parse do email
                msg = email.message_from_bytes(msg_bytes)
                message_id = msg.get("Message-ID", f"<{uid}@{config['imap_host']}>")

                # Extrai headers primeiro (necessário para atualizar nomes)
                from_header = msg.get("From", "")
                to_header = msg.get("To", "")
                subject = msg.get("Subject", "(sem assunto)")
                in_reply_to = msg.get("In-Reply-To")
                references = msg.get("References")

                # Determina direcao e extrai emails
                from_email = _extract_email(from_header)
                to_email = _extract_email(to_header)
                is_inbound = from_email.lower() != config["email"].lower()

                # Sempre tenta atualizar nome do remetente (mesmo para emails existentes)
                if is_inbound:
                    contact_name_update = _extract_name_from_header(from_header)
                    if contact_name_update:
                        _get_or_create_email_identity(db, str(owner_id), from_email, contact_name_update)

                # Verifica se ja existe
                existing = db.table("messages").select("id").eq(
                    "external_message_id", message_id
                ).execute()
                if existing.data:
                    continue  # Ja sincronizado

                # Decode subject se necessario
                if subject:
                    from email.header import decode_header
                    decoded = decode_header(subject)
                    subject = "".join(
                        part.decode(enc or "utf-8") if isinstance(part, bytes) else part
                        for part, enc in decoded
                    )

                # Extrai corpo
                body_text = ""
                body_html = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        if content_type == "text/plain":
                            payload = part.get_payload(decode=True)
                            if payload:
                                charset = part.get_content_charset() or "utf-8"
                                body_text = payload.decode(charset, errors="replace")
                        elif content_type == "text/html":
                            payload = part.get_payload(decode=True)
                            if payload:
                                charset = part.get_content_charset() or "utf-8"
                                body_html = payload.decode(charset, errors="replace")
                else:
                    payload = msg.get_payload(decode=True)
                    if payload:
                        charset = msg.get_content_charset() or "utf-8"
                        body_text = payload.decode(charset, errors="replace")

                content = body_text or body_html or "(vazio)"

                # Email do contato e nome (from_email, to_email, is_inbound já definidos acima)
                contact_email = from_email if is_inbound else to_email
                contact_name = _extract_name_from_header(from_header if is_inbound else to_header)

                # Busca ou cria identity com nome
                identity = _get_or_create_email_identity(db, str(owner_id), contact_email, contact_name)
                identity_id = identity["id"]

                # Busca conversa por threading ou identity
                conv_id = _find_or_create_conversation(
                    db, str(owner_id), workspace_id, identity_id,
                    in_reply_to, references
                )

                # Verifica se conversa foi criada agora
                if identity.get("_new_conversation"):
                    conversations_created += 1

                # Cria mensagem
                sent_at = internal_date.replace(tzinfo=timezone.utc) if internal_date else datetime.now(timezone.utc)
                db.table("messages").insert({
                    "id": str(uuid4()),
                    "conversation_id": conv_id,
                    "owner_id": str(owner_id),
                    "integration_account_id": str(request.account_id),
                    "channel": "email",
                    "direction": "inbound" if is_inbound else "outbound",
                    "identity_id": identity_id if is_inbound else None,
                    "text": content[:10000],
                    "subject": subject,
                    "from_address": from_header,
                    "to_address": to_header,
                    "external_message_id": message_id,
                    "external_reply_to_message_id": in_reply_to,
                    "sent_at": sent_at.isoformat(),
                }).execute()

                # Atualiza conversa com preview
                if body_text:
                    preview = (body_text[:100] + "...") if len(body_text) > 100 else body_text
                elif subject:
                    preview = (subject[:50] + "...") if len(subject) > 50 else subject
                else:
                    preview = "[Sem conteúdo]"

                db.table("conversations").update({
                    "last_message_at": sent_at.isoformat(),
                    "last_channel": "email",
                    "last_message_preview": preview,
                }).eq("id", conv_id).execute()

                emails_synced += 1
                print(f"[EMAIL SYNC] Sincronizado: {subject[:50]}...")

            except Exception as e:
                print(f"[EMAIL SYNC] Erro email {uid}: {e}")
                continue

        client.logout()
        print(f"[EMAIL SYNC] Concluido: {emails_synced}/{emails_found} emails")

    except Exception as e:
        print(f"[EMAIL SYNC] Erro IMAP: {e}")
        raise HTTPException(status_code=500, detail=f"Erro IMAP: {str(e)}")

    return EmailSyncResponse(
        emails_found=emails_found,
        emails_synced=emails_synced,
        conversations_created=conversations_created,
    )


def _extract_email(header: str) -> str:
    """Extrai email de header 'Name <email@example.com>'."""
    import re
    match = re.search(r"<([^>]+)>", header)
    if match:
        return match.group(1)
    # Se nao tem <>, assume que e so o email
    return header.strip()


def _extract_name_from_header(header: str) -> str | None:
    """Extrai nome do header 'Name <email@example.com>'."""
    from email.header import decode_header
    import re

    if not header:
        return None

    # Tenta decodificar header encoded (=?UTF-8?Q?...?=)
    try:
        decoded_parts = decode_header(header)
        decoded = ""
        for part, enc in decoded_parts:
            if isinstance(part, bytes):
                decoded += part.decode(enc or "utf-8", errors="replace")
            else:
                decoded += part
        header = decoded.strip()
    except:
        pass

    # Extrai nome antes do <email>
    match = re.match(r'^"?([^"<]+)"?\s*<', header)
    if match:
        name = match.group(1).strip().strip('"')
        if name and name != _extract_email(header):
            return name

    return None


def _get_or_create_email_identity(db, owner_id: str, email_addr: str, display_name: str | None = None) -> dict:
    """Busca ou cria identity para email, com nome do remetente."""
    result = db.table("contact_identities").select("id, contact_id, metadata").eq(
        "owner_id", owner_id
    ).eq("type", "email").eq("value", email_addr.lower()).execute()

    if result.data:
        identity = result.data[0]
        # Atualiza nome se descobrimos um novo e nao tinha antes
        if display_name:
            current_meta = identity.get("metadata") or {}
            if not current_meta.get("display_name"):
                db.table("contact_identities").update({
                    "metadata": {**current_meta, "display_name": display_name}
                }).eq("id", identity["id"]).execute()
        return identity

    # Cria nova identity com nome
    identity_id = str(uuid4())
    metadata = {"email": email_addr}
    if display_name:
        metadata["display_name"] = display_name

    db.table("contact_identities").insert({
        "id": identity_id,
        "owner_id": owner_id,
        "type": "email",
        "value": email_addr.lower(),
        "metadata": metadata,
    }).execute()

    return {"id": identity_id, "contact_id": None, "_new_conversation": True}


def _find_or_create_conversation(
    db, owner_id: str, workspace_id: str, identity_id: str,
    in_reply_to: str | None, references: str | None
) -> str:
    """Busca conversa por threading ou cria nova."""

    # 1. Tenta encontrar por In-Reply-To
    if in_reply_to:
        msg = db.table("messages").select("conversation_id").eq(
            "external_message_id", in_reply_to
        ).execute()
        if msg.data:
            return msg.data[0]["conversation_id"]

    # 2. Tenta por References
    if references:
        ref_ids = references.split()
        for ref_id in ref_ids:
            msg = db.table("messages").select("conversation_id").eq(
                "external_message_id", ref_id.strip()
            ).execute()
            if msg.data:
                return msg.data[0]["conversation_id"]

    # 3. Busca conversa existente por identity
    conv = db.table("conversations").select("id").eq(
        "owner_id", owner_id
    ).eq("primary_identity_id", identity_id).execute()

    if conv.data:
        return conv.data[0]["id"]

    # 4. Cria nova conversa
    conv_id = str(uuid4())
    db.table("conversations").insert({
        "id": conv_id,
        "owner_id": owner_id,
        "workspace_id": workspace_id,
        "primary_identity_id": identity_id,
        "status": "open",
        "last_channel": "email",
        "last_message_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return conv_id
