"""
Router Broadcast - Envia mensagens para canais/grupos Telegram.
Endpoint: POST /broadcast/{workspace_id}/telegram-channel
Auth: X-API-Key do workspace
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


class TelegramChannelBroadcastRequest(BaseModel):
    """Payload para enviar mensagem em canal/grupo Telegram."""
    channel_id: str  # Chat ID do canal (ex: -1001234567890)
    message: str
    image_url: str | None = None


class TelegramChannelBroadcastResponse(BaseModel):
    success: bool
    telegram_msg_id: int | None = None
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
    Usa conta Telegram ativa do workspace para enviar.
    """
    # Valida API key do workspace
    api_key_result = db.table("workspace_api_keys").select(
        "workspace_id"
    ).eq("api_key", x_api_key).eq("workspace_id", workspace_id).execute()

    if not api_key_result.data:
        raise HTTPException(status_code=401, detail="API key invalida para este workspace")

    # Busca conta Telegram ativa do workspace
    account_result = db.table("integration_accounts").select(
        "id, config"
    ).eq("workspace_id", workspace_id).eq(
        "type", "telegram_user"
    ).eq("is_active", True).limit(1).execute()

    if not account_result.data:
        raise HTTPException(
            status_code=404,
            detail="Nenhuma conta Telegram ativa neste workspace"
        )

    account = account_result.data[0]
    account_id = account["id"]

    # Envia via n8n webhook (mesmo pattern do messages.py)
    n8n_webhook_url = os.environ.get(
        "N8N_TELEGRAM_SEND_WEBHOOK",
        "https://n8nwebhook.thereconquestmap.com/webhook/telegram/send"
    )
    n8n_api_key = os.environ.get("N8N_API_KEY", "")

    try:
        payload = {
            "conversation_id": f"broadcast_{data.channel_id}",
            "text": data.message,
            "attachments": [data.image_url] if data.image_url else [],
            "broadcast": True,
            "channel_id": data.channel_id,
            "account_id": account_id,
        }

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                n8n_webhook_url,
                headers={
                    "X-API-KEY": n8n_api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code == 200:
            resp_data = response.json()
            logger.info(f"Broadcast telegram enviado: channel={data.channel_id}")
            return TelegramChannelBroadcastResponse(
                success=True,
                telegram_msg_id=resp_data.get("telegram_msg_id"),
            )
        else:
            error_msg = f"n8n error: {response.status_code} {response.text}"
            logger.error(f"Broadcast telegram falhou: {error_msg}")
            raise HTTPException(status_code=502, detail=error_msg)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Broadcast telegram exception: {e}")
        raise HTTPException(status_code=500, detail=str(e))
