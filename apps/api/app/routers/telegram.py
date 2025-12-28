from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from pydantic import BaseModel
from uuid import UUID, uuid4
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import SessionPasswordNeededError, PhoneCodeInvalidError
from telethon.tl.types import User, Chat, Channel
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional, List
import asyncio

from ..deps import get_supabase, get_current_user_id
from ..config import get_settings
from ..utils.crypto import encrypt, decrypt
from supabase import create_client as create_supabase_client
from ..models.integrations import (
    TelegramStartAuthRequest,
    TelegramStartAuthResponse,
    TelegramVerifyCodeRequest,
    TelegramVerifyCodeResponse,
    TelegramVerify2FARequest,
    TelegramVerify2FAResponse,
    WorkersStatusResponse,
    WorkerStatusItem,
    SyncHistoryRequest,
    SyncHistoryResponse,
    SyncJobStatus,
)

router = APIRouter(prefix="/telegram", tags=["telegram"])

# Cache de clientes temporários durante auth
_auth_clients: dict[str, TelegramClient] = {}


def get_telegram_client(session: str = "") -> TelegramClient:
    settings = get_settings()
    return TelegramClient(
        StringSession(session),
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )


@router.post("/auth/start", response_model=TelegramStartAuthResponse)
async def start_auth(
    request: TelegramStartAuthRequest,
    owner_id: UUID = Depends(get_current_user_id),
):
    """Inicia auth Telegram enviando código SMS."""
    settings = get_settings()

    if not settings.telegram_api_id or not settings.telegram_api_hash:
        raise HTTPException(status_code=500, detail="Telegram API não configurada")

    client = get_telegram_client()
    await client.connect()

    try:
        result = await client.send_code_request(request.phone_number)

        # Guarda cliente e workspace_id para próximo passo
        _auth_clients[request.phone_number] = {
            "client": client,
            "workspace_id": request.workspace_id,
        }

        return TelegramStartAuthResponse(
            phone_code_hash=result.phone_code_hash,
            message="Código enviado via SMS/Telegram",
        )
    except Exception as e:
        await client.disconnect()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/auth/verify-code", response_model=TelegramVerifyCodeResponse)
async def verify_code(
    request: TelegramVerifyCodeRequest,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Verifica código e finaliza auth (ou pede 2FA)."""
    auth_data = _auth_clients.get(request.phone_number)

    if not auth_data:
        raise HTTPException(status_code=400, detail="Sessão expirada, reinicie auth")

    client = auth_data["client"]
    workspace_id = request.workspace_id

    try:
        await client.sign_in(
            phone=request.phone_number,
            code=request.code,
            phone_code_hash=request.phone_code_hash,
        )

        # Auth completa - salvar sessão
        integration_id = await _save_integration(client, owner_id, workspace_id, request.phone_number, db)

        del _auth_clients[request.phone_number]
        await client.disconnect()

        return TelegramVerifyCodeResponse(
            success=True,
            needs_2fa=False,
            integration_id=integration_id,
        )

    except SessionPasswordNeededError:
        # Precisa 2FA
        return TelegramVerifyCodeResponse(
            success=False,
            needs_2fa=True,
            integration_id=None,
        )
    except PhoneCodeInvalidError:
        raise HTTPException(status_code=400, detail="Código inválido")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/auth/verify-2fa", response_model=TelegramVerify2FAResponse)
async def verify_2fa(
    request: TelegramVerify2FARequest,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Verifica senha 2FA e finaliza auth."""
    auth_data = _auth_clients.get(request.phone_number)

    if not auth_data:
        raise HTTPException(status_code=400, detail="Sessão expirada, reinicie auth")

    client = auth_data["client"]
    workspace_id = request.workspace_id

    try:
        await client.sign_in(password=request.password)

        # Auth completa - salvar sessão
        integration_id = await _save_integration(client, owner_id, workspace_id, request.phone_number, db)

        del _auth_clients[request.phone_number]
        await client.disconnect()

        return TelegramVerify2FAResponse(
            success=True,
            integration_id=integration_id,
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


async def _save_integration(
    client: TelegramClient,
    owner_id: UUID,
    workspace_id: UUID,
    phone_number: str,
    db: Client,
) -> UUID:
    """Salva integration_account com sessão criptografada."""
    # Extrai sessão como string
    session_string = client.session.save()

    # Criptografa sessão
    encrypted_session = encrypt(session_string)

    # Busca info do usuário
    me = await client.get_me()
    label = me.first_name or phone_number

    integration_id = uuid4()

    db.table("integration_accounts").insert({
        "id": str(integration_id),
        "owner_id": str(owner_id),
        "workspace_id": str(workspace_id),
        "type": "telegram_user",
        "label": label,
        "config": {
            "phone_number": phone_number,
            "telegram_user_id": me.id,
            "username": me.username,
        },
        "secrets_encrypted": encrypted_session,
        "is_active": True,
    }).execute()

    return integration_id


@router.get("/accounts")
async def list_accounts(
    workspace_id: Optional[UUID] = None,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Lista contas Telegram do usuário/workspace."""
    query = db.table("integration_accounts").select(
        "id, label, config, is_active, last_sync_at, last_error, created_at, workspace_id"
    ).eq("owner_id", str(owner_id)).eq("type", "telegram_user")

    if workspace_id:
        query = query.eq("workspace_id", str(workspace_id))

    result = query.execute()
    return result.data


@router.patch("/accounts/{account_id}")
async def update_account(
    account_id: UUID,
    label: str,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Atualiza label da conta Telegram."""
    db.table("integration_accounts").update({
        "label": label
    }).eq("id", str(account_id)).eq("owner_id", str(owner_id)).execute()
    return {"success": True}


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: UUID,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Remove conta Telegram. Mensagens são preservadas (integration_account_id fica NULL)."""
    try:
        # Remove worker heartbeats
        db.table("worker_heartbeats").delete().eq(
            "integration_account_id", str(account_id)
        ).execute()

        # Remove sync jobs pendentes
        db.table("sync_history_jobs").delete().eq(
            "integration_account_id", str(account_id)
        ).eq("status", "pending").execute()

        # Remove conta (FK SET NULL preserva mensagens)
        db.table("integration_accounts").delete().eq(
            "id", str(account_id)
        ).eq("owner_id", str(owner_id)).execute()

        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/workers/status", response_model=WorkersStatusResponse)
async def get_workers_status(
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Retorna status dos workers Telegram."""
    # Busca contas
    accounts = db.table("integration_accounts").select(
        "id, label"
    ).eq("owner_id", str(owner_id)).eq("type", "telegram_user").eq("is_active", True).execute()

    # Busca heartbeats
    heartbeats = db.table("worker_heartbeats").select(
        "integration_account_id, status, last_heartbeat_at"
    ).eq("owner_id", str(owner_id)).eq("worker_type", "telegram").execute()

    hb_map = {h["integration_account_id"]: h for h in heartbeats.data}

    items = []
    for acc in accounts.data:
        hb = hb_map.get(acc["id"])
        items.append(WorkerStatusItem(
            account_id=acc["id"],
            label=acc["label"],
            status=hb["status"] if hb else "offline",
            last_heartbeat=hb["last_heartbeat_at"] if hb else None,
        ))

    return WorkersStatusResponse(telegram=items)


# ============================================
# Sync History
# ============================================

# Período define APENAS quais conversas descobrir (atividade recente)
# Cada conversa sincroniza o HISTÓRICO COMPLETO
PERIOD_DAYS = {
    "1d": 1,
    "3d": 3,
    "7d": 7,
}

# Limite alto para pegar histórico completo (sem limite prático)
FULL_HISTORY_LIMIT = 10000


async def _download_and_store_avatar(
    client: TelegramClient,
    owner_id: str,
    entity
) -> str | None:
    """Baixa foto de perfil do Telegram e salva no Supabase Storage."""
    try:
        photo_bytes = await client.download_profile_photo(entity, file=bytes)
        if not photo_bytes:
            return None

        settings = get_settings()
        # Garante que URL tem trailing slash
        supabase_url = settings.supabase_url.rstrip('/') + '/'
        storage_client = create_supabase_client(
            supabase_url,
            settings.supabase_service_role_key
        )

        telegram_id = entity.id
        storage_path = f"telegram/{owner_id}/telegram_{telegram_id}.jpg"

        # Remove foto antiga se existir
        try:
            storage_client.storage.from_("avatars").remove([storage_path])
        except Exception:
            pass

        # Upload nova foto
        result = storage_client.storage.from_("avatars").upload(
            storage_path,
            photo_bytes,
            {"content-type": "image/jpeg"}
        )

        # URL sem trailing slash para consistencia
        base_url = settings.supabase_url.rstrip('/')
        avatar_url = f"{base_url}/storage/v1/object/public/avatars/{storage_path}"
        print(f"[AVATAR] OK: {telegram_id} -> {storage_path}")
        return avatar_url

    except Exception as e:
        print(f"[AVATAR] Erro {entity.id}: {e}")
        return None


async def _get_or_create_identity(db, owner_id: str, entity, client: TelegramClient = None) -> dict:
    """Busca ou cria identity para entidade Telegram (com avatar)."""
    telegram_id = str(entity.id)

    # Busca identity existente
    result = db.table("contact_identities").select(
        "id, contact_id, metadata"
    ).eq("owner_id", owner_id).eq(
        "type", "telegram_user"
    ).eq("value", telegram_id).execute()

    # Baixa avatar se client disponivel
    avatar_url = None
    if client:
        avatar_url = await _download_and_store_avatar(client, owner_id, entity)

    if result.data:
        existing = result.data[0]
        current_metadata = existing.get("metadata") or {}
        needs_update = False

        # Atualiza avatar se tiver novo
        if avatar_url:
            current_metadata["avatar_url"] = avatar_url
            needs_update = True

        # Marca como grupo se for Chat/Channel e ainda não está marcado
        if isinstance(entity, (Chat, Channel)) and not current_metadata.get("is_group"):
            current_metadata["is_group"] = True
            needs_update = True

        if needs_update:
            db.table("contact_identities").update({
                "metadata": current_metadata
            }).eq("id", existing["id"]).execute()

        return existing

    # Extrai metadados
    metadata = {"avatar_url": avatar_url}
    if isinstance(entity, User):
        metadata.update({
            "first_name": entity.first_name,
            "last_name": entity.last_name,
            "username": entity.username,
        })
    elif isinstance(entity, (Chat, Channel)):
        metadata.update({
            "title": entity.title,
            "username": getattr(entity, 'username', None),
            "is_group": True,
        })

    # Cria identity
    identity_id = str(uuid4())
    db.table("contact_identities").insert({
        "id": identity_id,
        "owner_id": owner_id,
        "contact_id": None,
        "type": "telegram_user",
        "value": telegram_id,
        "metadata": metadata,
    }).execute()

    return {"id": identity_id, "contact_id": None}


async def _get_or_create_conversation(db, owner_id: str, identity_id: str, workspace_id: str) -> dict:
    """Busca ou cria conversa para identity."""
    # Busca conversa existente pela identity
    result = db.table("conversations").select(
        "id"
    ).eq("owner_id", owner_id).eq("primary_identity_id", identity_id).execute()

    if result.data:
        return result.data[0]

    # Cria conversa
    conv_id = str(uuid4())
    db.table("conversations").insert({
        "id": conv_id,
        "owner_id": owner_id,
        "workspace_id": workspace_id,
        "contact_id": None,
        "primary_identity_id": identity_id,
        "status": "open",
        "last_channel": "telegram",
        "last_message_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return {"id": conv_id}


@router.post("/sync-history", response_model=SyncHistoryResponse)
async def sync_history(
    request: SyncHistoryRequest,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Descobre conversas com atividade recente e sincroniza histórico COMPLETO de cada uma."""
    # Período define apenas QUAIS conversas descobrir, não limita mensagens
    # Cada conversa sincroniza o histórico completo (até 10000 msgs)

    # Busca conta com sessão
    account = db.table("integration_accounts").select(
        "id, secrets_encrypted"
    ).eq("id", str(request.account_id)).eq(
        "owner_id", str(owner_id)
    ).eq("type", "telegram_user").execute()

    if not account.data:
        raise HTTPException(404, "Conta não encontrada")

    acc = account.data[0]
    workspace_id = str(request.workspace_id)

    # Descriptografa sessão e conecta no Telegram
    try:
        session_string = decrypt(acc["secrets_encrypted"])
    except Exception as e:
        raise HTTPException(500, f"Erro ao descriptografar sessão: {e}")

    settings = get_settings()
    client = TelegramClient(
        StringSession(session_string),
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )

    job_ids = []
    discovered = 0
    skipped_existing = 0
    skipped_old = 0

    # Calcula data limite
    period_days = PERIOD_DAYS.get(request.period, 1)
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=period_days)

    try:
        print(f"[SYNC] Conectando no Telegram para conta {request.account_id}...")
        await client.connect()

        if not await client.is_user_authorized():
            raise HTTPException(401, "Sessão Telegram expirada, reconecte a conta")

        print(f"[SYNC] Conectado! Buscando diálogos dos últimos {period_days} dia(s)...")

        # Itera diálogos
        async for dialog in client.iter_dialogs():
            entity = dialog.entity
            if not entity:
                continue

            # Pula bots
            if isinstance(entity, User) and entity.bot:
                continue

            # Pula diálogos sem mensagem recente
            if dialog.date and dialog.date.replace(tzinfo=timezone.utc) < cutoff_date:
                skipped_old += 1
                continue

            discovered += 1
            name = getattr(entity, 'title', None) or getattr(entity, 'first_name', None) or str(entity.id)
            safe_name = name.encode('ascii', 'replace').decode('ascii')
            print(f"[SYNC] Dialogo {discovered}: {safe_name} (id={entity.id})")

            # Cria identity se não existir (com avatar)
            identity = await _get_or_create_identity(db, str(owner_id), entity, client)
            identity_id = identity["id"]

            # Cria conversa se não existir
            conv = await _get_or_create_conversation(db, str(owner_id), identity_id, workspace_id)
            conv_id = conv["id"]

            # Verifica se já tem job pendente/processing
            existing = db.table("sync_history_jobs").select("id").eq(
                "conversation_id", conv_id
            ).in_("status", ["pending", "processing"]).execute()

            if existing.data:
                skipped_existing += 1
                print(f"[SYNC] -> Pulando, já tem job pendente")
                continue

            # Cria job de sync (histórico completo)
            job_id = uuid4()
            db.table("sync_history_jobs").insert({
                "id": str(job_id),
                "owner_id": str(owner_id),
                "conversation_id": conv_id,
                "integration_account_id": str(request.account_id),
                "limit_messages": FULL_HISTORY_LIMIT,
                "status": "pending",
            }).execute()
            job_ids.append(job_id)
            print(f"[SYNC] -> Job criado: {job_id}")

        print(f"[SYNC] Concluido: {discovered} recentes, {len(job_ids)} jobs, {skipped_existing} existentes, {skipped_old} antigos")

    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e).encode('ascii', 'replace').decode('ascii')
        print(f"[SYNC] ERRO: {err_msg}")
        raise HTTPException(500, f"Erro ao conectar no Telegram: {err_msg}")
    finally:
        await client.disconnect()

    return SyncHistoryResponse(
        jobs_created=len(job_ids),
        job_ids=job_ids,
        messages_synced=discovered,
    )


@router.get("/sync-history/status", response_model=List[SyncJobStatus])
async def get_sync_status(
    account_id: Optional[UUID] = None,
    owner_id: UUID = Depends(get_current_user_id),
    db: Client = Depends(get_supabase),
):
    """Retorna status dos jobs de sync."""
    query = db.table("sync_history_jobs").select(
        "id, conversation_id, status, messages_synced, error_message, created_at"
    ).eq("owner_id", str(owner_id)).order("created_at", desc=True).limit(50)

    if account_id:
        query = query.eq("integration_account_id", str(account_id))

    result = query.execute()

    return [SyncJobStatus(**j) for j in result.data]
