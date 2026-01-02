"""
API HTTP interna do Worker Telegram.

Expõe endpoints para o n8n enviar comandos de envio de mensagem.
Roda junto com o worker Telethon na porta 8001.
"""

import os
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel

if TYPE_CHECKING:
    from worker import TelegramWorker

# Configuração
WORKER_API_KEY = os.environ.get("WORKER_API_KEY", "")
WORKER_HTTP_PORT = int(os.environ.get("WORKER_HTTP_PORT", "8001"))

# Referência global ao worker (setada em worker.py)
_worker: "TelegramWorker | None" = None
_start_time: datetime = datetime.now(timezone.utc)


def set_worker(worker: "TelegramWorker"):
    """Define a referência ao worker. Chamado pelo worker.py no startup."""
    global _worker
    _worker = worker


def get_worker() -> "TelegramWorker":
    """Dependency para obter o worker."""
    if _worker is None:
        raise HTTPException(status_code=503, detail="Worker não inicializado")
    return _worker


# ============ MODELOS ============

class SendRequest(BaseModel):
    """Request para enviar mensagem."""
    account_id: str
    telegram_user_id: int
    text: str | None = None
    attachments: list[str] = []  # URLs do Supabase Storage
    reply_to_msg_id: int | None = None


class SendResponse(BaseModel):
    """Response do envio de mensagem."""
    success: bool
    telegram_msg_id: int | None = None
    error: str | None = None


class HealthResponse(BaseModel):
    """Response do health check."""
    status: str
    accounts_connected: int
    uptime_seconds: float


# ============ AUTH ============

async def verify_api_key(x_api_key: str = Header(..., alias="X-API-KEY")):
    """Verifica API Key no header."""
    if not WORKER_API_KEY:
        # Se não configurou API key, aceita qualquer coisa (dev mode)
        return True
    
    if x_api_key != WORKER_API_KEY:
        raise HTTPException(status_code=401, detail="API Key inválida")
    
    return True


# ============ APP ============

app = FastAPI(
    title="Telegram Worker API",
    description="API interna para envio de mensagens via Telegram",
    version="1.0.0",
)


@app.get("/health", response_model=HealthResponse)
async def health():
    """
    Health check do worker.
    
    Retorna status, número de contas conectadas e uptime.
    Não requer autenticação.
    """
    worker = _worker
    accounts = len(worker.clients) if worker else 0
    uptime = (datetime.now(timezone.utc) - _start_time).total_seconds()
    
    return HealthResponse(
        status="ok" if worker else "initializing",
        accounts_connected=accounts,
        uptime_seconds=uptime,
    )


@app.post("/send", response_model=SendResponse, dependencies=[Depends(verify_api_key)])
async def send_message(req: SendRequest):
    """
    Envia mensagem via Telegram.
    
    Chamado pelo n8n quando o frontend quer enviar uma mensagem.
    
    Args:
        req: Dados da mensagem (account_id, telegram_user_id, text, attachments)
        
    Returns:
        Success status e telegram_msg_id se enviou com sucesso
    """
    worker = get_worker()
    
    # Verifica se conta está conectada
    if req.account_id not in worker.clients:
        return SendResponse(
            success=False,
            error=f"Conta {req.account_id} não conectada"
        )
    
    client = worker.clients[req.account_id]
    
    try:
        # Resolve entity do destinatário
        entity = await _resolve_entity(worker, client, req.telegram_user_id)
        
        if not entity:
            return SendResponse(
                success=False,
                error=f"Não foi possível encontrar usuário {req.telegram_user_id}"
            )
        
        # Envia mensagem
        sent = None
        
        if req.attachments:
            # Envia com mídia
            sent = await _send_with_attachments(
                client, entity, req.text, req.attachments, req.reply_to_msg_id
            )
        elif req.text:
            # Envia apenas texto
            sent = await client.send_message(
                entity,
                req.text,
                reply_to=req.reply_to_msg_id
            )
        else:
            return SendResponse(
                success=False,
                error="Mensagem deve ter texto ou attachments"
            )
        
        if sent:
            print(f"[API] Mensagem enviada: {sent.id} para {req.telegram_user_id}")
            # Marca no cache para o handler Raw ignorar (evita duplicata)
            worker._mark_sent_via_api(sent.id)
            return SendResponse(
                success=True,
                telegram_msg_id=sent.id
            )
        else:
            return SendResponse(
                success=False,
                error="Falha ao enviar mensagem"
            )
            
    except Exception as e:
        print(f"[API] Erro ao enviar mensagem: {e}")
        import traceback
        traceback.print_exc()
        return SendResponse(
            success=False,
            error=str(e)
        )


async def _resolve_entity(worker: "TelegramWorker", client, telegram_user_id: int):
    """Resolve entity do Telegram usando cache do worker."""
    from telethon.tl.types import InputPeerUser
    
    # 1. Verifica cache
    cached = worker._get_cached_entity(telegram_user_id)
    if cached:
        print(f"[API] Entity do cache: {telegram_user_id}")
        return cached
    
    # 2. Verifica cache negativo
    if worker._is_entity_failed(telegram_user_id):
        print(f"[API] Entity em cache negativo: {telegram_user_id}")
        return None
    
    # 3. Busca via Telegram
    try:
        entity = await client.get_entity(telegram_user_id)
        if entity:
            worker._cache_entity(telegram_user_id, entity)
            print(f"[API] Entity resolvida: {telegram_user_id}")
            return entity
    except Exception as e:
        print(f"[API] Erro ao resolver entity {telegram_user_id}: {e}")
        worker._mark_entity_failed(telegram_user_id)
    
    return None


async def _send_with_attachments(client, entity, text: str | None, attachments: list[str], reply_to: int | None):
    """Envia mensagem com attachments (URLs do Supabase)."""
    import httpx
    import io
    
    sent = None
    
    for i, url in enumerate(attachments):
        try:
            # Baixa arquivo da URL
            async with httpx.AsyncClient(timeout=60) as http:
                response = await http.get(url)
                if response.status_code != 200:
                    print(f"[API] Erro ao baixar attachment: {response.status_code}")
                    continue
                
                file_bytes = response.content
            
            # Extrai nome do arquivo da URL
            file_name = url.split("/")[-1].split("?")[0]
            
            # Detecta tipo
            content_type = response.headers.get("content-type", "application/octet-stream")
            is_image = content_type.startswith("image/")
            is_audio = content_type.startswith("audio/")
            
            # Prepara arquivo
            file_like = io.BytesIO(file_bytes)
            file_like.name = file_name
            
            # Caption só no primeiro arquivo
            caption = text if i == 0 and text else None
            
            # Envia
            if is_audio:
                sent = await client.send_file(
                    entity,
                    file_like,
                    caption=caption,
                    voice_note=True,
                    reply_to=reply_to if i == 0 else None,
                )
            elif is_image:
                sent = await client.send_file(
                    entity,
                    file_like,
                    caption=caption,
                    force_document=False,
                    reply_to=reply_to if i == 0 else None,
                )
            else:
                sent = await client.send_file(
                    entity,
                    file_like,
                    caption=caption,
                    force_document=True,
                    reply_to=reply_to if i == 0 else None,
                )
            
            print(f"[API] Attachment enviado: {file_name}")
            
        except Exception as e:
            print(f"[API] Erro ao enviar attachment {url}: {e}")
    
    # Se tinha texto mas não enviou com mídia, envia só texto
    if not sent and text:
        sent = await client.send_message(entity, text, reply_to=reply_to)
    
    return sent
