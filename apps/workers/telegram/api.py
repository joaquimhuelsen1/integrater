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


class RecipientData(BaseModel):
    """Dados do destinatário."""
    telegram_user_id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None


class SendResponse(BaseModel):
    """Response do envio de mensagem."""
    success: bool
    telegram_msg_id: int | None = None
    error: str | None = None
    recipient: RecipientData | None = None


class EditRequest(BaseModel):
    """Request para editar mensagem."""
    account_id: str
    telegram_user_id: int
    telegram_msg_id: int
    new_text: str


class EditResponse(BaseModel):
    """Response da edição."""
    success: bool
    error: str | None = None


class DeleteRequest(BaseModel):
    """Request para deletar mensagem."""
    account_id: str
    telegram_user_id: int
    telegram_msg_id: int
    revoke: bool = True  # True = apagar para todos


class DeleteResponse(BaseModel):
    """Response da deleção."""
    success: bool
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
        
        # Marca pending ANTES de enviar (evita race condition com handler Raw)
        worker._mark_pending_send(req.telegram_user_id)
        
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
            worker._mark_sent_via_api(sent.id, req.telegram_user_id)
            
            # Busca dados do destinatário (nome, foto)
            recipient_data = await worker._get_sender_data(client, req.telegram_user_id)
            
            return SendResponse(
                success=True,
                telegram_msg_id=sent.id,
                recipient=RecipientData(
                    telegram_user_id=req.telegram_user_id,
                    first_name=recipient_data.get("first_name"),
                    last_name=recipient_data.get("last_name"),
                    username=recipient_data.get("username"),
                    photo_url=recipient_data.get("photo_url"),
                )
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
    from telethon.tl.types import User
    
    # 1. Verifica cache positivo
    cached = worker._get_cached_entity(telegram_user_id)
    if cached:
        print(f"[API] Entity do cache: {telegram_user_id}")
        return cached
    
    # 2. Tenta get_entity (ignora cache negativo - sempre tenta)
    try:
        entity = await client.get_entity(telegram_user_id)
        if entity:
            worker._cache_entity(telegram_user_id, entity)
            # Limpa cache negativo se existia
            if telegram_user_id in worker.entity_fail_cache:
                del worker.entity_fail_cache[telegram_user_id]
            print(f"[API] Entity resolvida via get_entity: {telegram_user_id}")
            return entity
    except Exception as e:
        print(f"[API] get_entity falhou para {telegram_user_id}: {e}")
    
    # 3. Fallback: busca nos dialogs
    try:
        print(f"[API] Tentando fallback via dialogs para {telegram_user_id}")
        async for dialog in client.iter_dialogs(limit=200):
            if dialog.entity and hasattr(dialog.entity, 'id') and dialog.entity.id == telegram_user_id:
                worker._cache_entity(telegram_user_id, dialog.entity)
                # Limpa cache negativo se existia
                if telegram_user_id in worker.entity_fail_cache:
                    del worker.entity_fail_cache[telegram_user_id]
                print(f"[API] Entity resolvida via dialogs: {telegram_user_id}")
                return dialog.entity
    except Exception as e:
        print(f"[API] iter_dialogs falhou: {e}")
    
    # 4. Fallback: tenta get_input_entity
    try:
        input_entity = await client.get_input_entity(telegram_user_id)
        if input_entity:
            entity = await client.get_entity(input_entity)
            if entity:
                worker._cache_entity(telegram_user_id, entity)
                print(f"[API] Entity resolvida via get_input_entity: {telegram_user_id}")
                return entity
    except Exception as e:
        print(f"[API] get_input_entity falhou: {e}")
    
    print(f"[API] Não conseguiu resolver entity: {telegram_user_id}")
    return None


@app.post("/edit", response_model=EditResponse, dependencies=[Depends(verify_api_key)])
async def edit_message(req: EditRequest):
    """
    Edita uma mensagem no Telegram.
    
    Chamado pelo n8n quando o frontend edita uma mensagem.
    
    Args:
        req: Dados (account_id, telegram_user_id, telegram_msg_id, new_text)
        
    Returns:
        Success status
    """
    worker = get_worker()
    
    if req.account_id not in worker.clients:
        return EditResponse(
            success=False,
            error=f"Conta {req.account_id} não conectada"
        )
    
    client = worker.clients[req.account_id]
    
    try:
        # Edita mensagem no Telegram
        await client.edit_message(req.telegram_user_id, req.telegram_msg_id, req.new_text)
        print(f"[API] Mensagem {req.telegram_msg_id} editada para user {req.telegram_user_id}")
        
        return EditResponse(success=True)
        
    except Exception as e:
        print(f"[API] Erro ao editar mensagem: {e}")
        import traceback
        traceback.print_exc()
        return EditResponse(success=False, error=str(e))


@app.post("/delete", response_model=DeleteResponse, dependencies=[Depends(verify_api_key)])
async def delete_message(req: DeleteRequest):
    """
    Deleta uma mensagem no Telegram.
    
    Chamado pelo n8n quando o frontend deleta uma mensagem.
    
    Args:
        req: Dados (account_id, telegram_user_id, telegram_msg_id, revoke)
        
    Returns:
        Success status
    """
    worker = get_worker()
    
    if req.account_id not in worker.clients:
        return DeleteResponse(
            success=False,
            error=f"Conta {req.account_id} não conectada"
        )
    
    client = worker.clients[req.account_id]
    
    try:
        # Deleta mensagem no Telegram (revoke=True apaga para todos)
        await client.delete_messages(req.telegram_user_id, [req.telegram_msg_id], revoke=req.revoke)
        print(f"[API] Mensagem {req.telegram_msg_id} deletada para user {req.telegram_user_id} (revoke={req.revoke})")
        
        return DeleteResponse(success=True)
        
    except Exception as e:
        print(f"[API] Erro ao deletar mensagem: {e}")
        import traceback
        traceback.print_exc()
        return DeleteResponse(success=False, error=str(e))


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
