"""
Router Broadcast - Envia mensagens para canais/grupos Telegram.
Endpoint: POST /broadcast/{workspace_id}/telegram-channel
Auth: X-API-Key do workspace

Chama o Worker Telegram diretamente (sem n8n) e salva no Supabase.
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Path
from supabase import Client
from pydantic import BaseModel
import httpx
import os
import logging

from app.deps import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/broadcast", tags=["broadcast"])

# Worker Telegram interno (docker network)
TELEGRAM_WORKER_URL = os.environ.get("TELEGRAM_WORKER_URL", "http://telegram-worker:8001")
WORKER_API_KEY = os.environ.get("WORKER_API_KEY", "")


class TelegramChannelBroadcastRequest(BaseModel):
    """Payload para enviar mensagem em canal/grupo Telegram."""
    channel_id: str  # Chat ID do canal (ex: -1001234567890)
    message: str
    image_url: str | None = None
    pin_message: bool = True  # Fixar mensagem no canal (default: sim)
    notify: bool = True  # Notificar membros do canal (default: sim)


class TelegramChannelBroadcastResponse(BaseModel):
    success: bool
    telegram_msg_id: int | None = None
    pinned: bool = False
    error: str | None = None


@router.post("/{workspace_id}/telegram-channel", response_model=TelegramChannelBroadcastResponse)
async def broadcast_telegram_channel(
    data: TelegramChannelBroadcastRequest,
    workspace_id: str = Path(..., description="ID do workspace (UUID)"),
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: Client = Depends(get_supabase),
):
    """
    Envia mensagem para canal/grupo Telegram via workspace.

    Auth: X-API-Key header (API key do workspace).
    Chama Worker Telegram diretamente e salva historico no Supabase.
    """
    # Valida API key do workspace
    api_key_result = db.table("workspace_api_keys").select(
        "workspace_id"
    ).eq("api_key", x_api_key).eq("workspace_id", workspace_id).execute()

    if not api_key_result.data:
        raise HTTPException(status_code=401, detail="API key invalida para este workspace")

    # Busca conta Telegram ativa do workspace
    account_result = db.table("integration_accounts").select(
        "id"
    ).eq("workspace_id", workspace_id).eq(
        "type", "telegram_user"
    ).eq("is_active", True).limit(1).execute()

    if not account_result.data:
        raise HTTPException(
            status_code=404,
            detail="Nenhuma conta Telegram ativa neste workspace"
        )

    account_id = account_result.data[0]["id"]

    # Chama Worker Telegram diretamente (sem n8n)
    try:
        worker_payload = {
            "account_id": account_id,
            "channel_id": data.channel_id,
            "text": data.message,
            "attachments": [data.image_url] if data.image_url else [],
            "pin_message": data.pin_message,
            "silent": not data.notify,
        }

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{TELEGRAM_WORKER_URL}/send",
                headers={
                    "X-API-KEY": WORKER_API_KEY,
                    "Content-Type": "application/json",
                },
                json=worker_payload,
            )

        resp_data = response.json()

        if response.status_code == 200 and resp_data.get("success"):
            telegram_msg_id = resp_data.get("telegram_msg_id")
            pinned = resp_data.get("pinned", False)

            # Salva broadcast no Supabase
            db.table("broadcast_messages").insert({
                "workspace_id": workspace_id,
                "channel_id": data.channel_id,
                "account_id": account_id,
                "text": data.message,
                "image_url": data.image_url,
                "telegram_msg_id": telegram_msg_id,
                "status": "sent",
                "pinned": pinned,
            }).execute()

            logger.info(f"Broadcast enviado: channel={data.channel_id} msg_id={telegram_msg_id} pinned={pinned}")
            return TelegramChannelBroadcastResponse(
                success=True,
                telegram_msg_id=telegram_msg_id,
                pinned=pinned,
            )
        else:
            error_msg = resp_data.get("error", f"Worker error: {response.status_code}")
            logger.error(f"Broadcast falhou: {error_msg}")

            # Salva erro no historico
            db.table("broadcast_messages").insert({
                "workspace_id": workspace_id,
                "channel_id": data.channel_id,
                "account_id": account_id,
                "text": data.message,
                "image_url": data.image_url,
                "status": "failed",
                "error": error_msg,
            }).execute()

            raise HTTPException(status_code=502, detail=error_msg)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Broadcast exception: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{workspace_id}/history")
async def broadcast_history(
    workspace_id: str = Path(..., description="ID do workspace (UUID)"),
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: Client = Depends(get_supabase),
    limit: int = 50,
):
    """Lista historico de broadcasts do workspace."""
    # Valida API key
    api_key_result = db.table("workspace_api_keys").select(
        "workspace_id"
    ).eq("api_key", x_api_key).eq("workspace_id", workspace_id).execute()

    if not api_key_result.data:
        raise HTTPException(status_code=401, detail="API key invalida para este workspace")

    result = db.table("broadcast_messages").select("*").eq(
        "workspace_id", workspace_id
    ).order("created_at", desc=True).limit(limit).execute()

    return result.data
