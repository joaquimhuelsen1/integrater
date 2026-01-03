"""
API HTTP interna do Worker Email.

Expoe endpoints para o n8n enviar comandos de envio de email.
Roda junto com o worker IMAP na porta 8002.
"""

import os
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel

if TYPE_CHECKING:
    from worker import EmailWorker

# Configuracao
EMAIL_WORKER_API_KEY = os.environ.get("EMAIL_WORKER_API_KEY", "")
EMAIL_WORKER_HTTP_PORT = int(os.environ.get("EMAIL_WORKER_HTTP_PORT", "8002"))

# Referencia global ao worker (setada em worker.py)
_worker: "EmailWorker | None" = None
_start_time: datetime = datetime.now(timezone.utc)


def set_worker(worker: "EmailWorker"):
    """Define a referencia ao worker. Chamado pelo worker.py no startup."""
    global _worker
    _worker = worker


def get_worker() -> "EmailWorker":
    """Dependency para obter o worker."""
    if _worker is None:
        raise HTTPException(status_code=503, detail="Worker nao inicializado")
    return _worker


# ============ MODELOS ============

class SendEmailRequest(BaseModel):
    """Request para enviar email."""
    account_id: str
    to_email: str
    subject: str | None = None
    body: str | None = None
    html: str | None = None
    in_reply_to: str | None = None  # Message-ID para threading
    attachments: list[str] = []  # URLs do Supabase Storage


class SendEmailResponse(BaseModel):
    """Response do envio de email."""
    success: bool
    message_id: str | None = None
    error: str | None = None


class HealthResponse(BaseModel):
    """Response do health check."""
    status: str
    accounts_connected: int
    uptime_seconds: float


# ============ AUTH ============

async def verify_api_key(x_api_key: str | None = Header(None, alias="X-API-KEY")):
    """Verifica API Key no header (opcional se EMAIL_WORKER_API_KEY nao configurado)."""
    if not EMAIL_WORKER_API_KEY:
        # Se nao configurou API key, aceita qualquer coisa (dev mode)
        return True
    
    if not x_api_key or x_api_key != EMAIL_WORKER_API_KEY:
        raise HTTPException(status_code=401, detail="API Key invalida")
    
    return True


# ============ APP ============

app = FastAPI(
    title="Email Worker API",
    description="API interna para envio de emails via SMTP",
    version="1.0.0",
)


@app.get("/health", response_model=HealthResponse)
async def health():
    """
    Health check do worker.
    
    Retorna status, numero de contas conectadas e uptime.
    Nao requer autenticacao.
    """
    worker = _worker
    accounts = len(worker.clients) if worker else 0
    uptime = (datetime.now(timezone.utc) - _start_time).total_seconds()
    
    return HealthResponse(
        status="ok" if worker else "initializing",
        accounts_connected=accounts,
        uptime_seconds=uptime,
    )


@app.post("/send", response_model=SendEmailResponse, dependencies=[Depends(verify_api_key)])
async def send_email(req: SendEmailRequest):
    """
    Envia email via SMTP.
    
    Chamado pelo n8n quando o frontend quer enviar um email.
    
    Args:
        req: Dados do email (account_id, to_email, subject, body, html, attachments)
        
    Returns:
        Success status e message_id se enviou com sucesso
    """
    worker = get_worker()
    
    # Verifica se conta esta conectada
    if req.account_id not in worker.clients:
        return SendEmailResponse(
            success=False,
            error=f"Conta {req.account_id} nao conectada"
        )
    
    try:
        # Delega envio para o worker
        result = await worker.send_email_via_api(
            account_id=req.account_id,
            to_email=req.to_email,
            subject=req.subject,
            body=req.body,
            html=req.html,
            in_reply_to=req.in_reply_to,
            attachments=req.attachments,
        )
        
        if result.get("success"):
            return SendEmailResponse(
                success=True,
                message_id=result.get("message_id"),
            )
        else:
            return SendEmailResponse(
                success=False,
                error=result.get("error", "Erro desconhecido"),
            )
            
    except Exception as e:
        print(f"[API] Erro ao enviar email: {e}")
        import traceback
        traceback.print_exc()
        return SendEmailResponse(
            success=False,
            error=str(e)
        )
