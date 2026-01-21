"""
Router Logs - Visualização de logs do sistema (M9).
"""

from fastapi import APIRouter, Depends, Query
from supabase import Client
from uuid import UUID
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel

from ..deps import get_supabase, get_current_user_id


router = APIRouter(prefix="/logs", tags=["logs"])


class LogEntry(BaseModel):
    """Entrada de log."""
    id: str
    timestamp: str
    level: str  # info, warning, error
    source: str  # telegram, email, sms, system
    message: str
    details: Optional[dict] = None


class LogsResponse(BaseModel):
    """Response com logs."""
    logs: list[LogEntry]
    total: int


@router.get("", response_model=LogsResponse)
async def list_logs(
    level: Optional[str] = None,  # info, warning, error
    source: Optional[str] = None,  # telegram, email, sms, system
    search: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista logs do sistema com filtros."""
    logs = []

    # 1. Busca erros de integration_accounts
    accounts_query = db.table("integration_accounts").select(
        "id, type, label, last_error, updated_at"
    ).eq("owner_id", str(owner_id)).not_.is_("last_error", "null")

    accounts_result = accounts_query.execute()

    for acc in accounts_result.data or []:
        acc_type = acc["type"]
        if acc_type == "telegram_user":
            src = "telegram"
        elif acc_type == "email_imap_smtp":
            src = "email"
        elif acc_type == "openphone":
            src = "sms"
        else:
            src = "system"

        if source and source != src:
            continue

        if level and level != "error":
            continue

        logs.append(LogEntry(
            id=f"acc-{acc['id']}",
            timestamp=acc["updated_at"],
            level="error",
            source=src,
            message=f"Erro na conta {acc['label']}: {acc['last_error']}",
            details={"account_id": acc["id"], "account_type": acc_type},
        ))

    # 2. Busca heartbeats com status offline/error
    hb_query = db.table("worker_heartbeats").select(
        "id, worker_type, status, last_heartbeat_at, integration_account_id"
    ).eq("owner_id", str(owner_id))

    hb_result = hb_query.execute()

    for hb in hb_result.data or []:
        src = hb["worker_type"]

        if source and source != src:
            continue

        # Verifica se heartbeat está atrasado (> 4 min)
        # Nota: heartbeat interval é 120s, então 4 min dá margem para jitter de rede
        try:
            last_hb = datetime.fromisoformat(hb["last_heartbeat_at"].replace("Z", "+00:00"))
            now = datetime.now(last_hb.tzinfo) if last_hb.tzinfo else datetime.utcnow()
            is_stale = (now - last_hb) > timedelta(minutes=4)
        except:
            is_stale = True

        if hb["status"] == "error":
            if level and level != "error":
                continue
            logs.append(LogEntry(
                id=f"hb-{hb['id']}",
                timestamp=hb["last_heartbeat_at"],
                level="error",
                source=src,
                message=f"Worker {src} com erro",
                details={"heartbeat_id": hb["id"], "status": hb["status"]},
            ))
        elif is_stale:
            if level and level != "warning":
                continue
            logs.append(LogEntry(
                id=f"hb-{hb['id']}",
                timestamp=hb["last_heartbeat_at"],
                level="warning",
                source=src,
                message=f"Worker {src} sem heartbeat recente (> 2 min)",
                details={"heartbeat_id": hb["id"], "status": hb["status"]},
            ))
        elif not level or level == "info":
            logs.append(LogEntry(
                id=f"hb-{hb['id']}",
                timestamp=hb["last_heartbeat_at"],
                level="info",
                source=src,
                message=f"Worker {src} online",
                details={"heartbeat_id": hb["id"], "status": hb["status"]},
            ))

    # 3. Busca sync jobs
    sync_query = db.table("sync_history_jobs").select(
        "id, status, created_at, processed_at, messages_synced, error_message, conversation_id"
    ).eq("owner_id", str(owner_id)).order("created_at", desc=True).limit(50)

    sync_result = sync_query.execute()

    for job in sync_result.data or []:
        if source and source != "telegram":
            continue

        job_status = job["status"]
        if job_status == "completed":
            if level and level != "info":
                continue
            lvl = "info"
            msg_text = f"Sync concluído: {job['messages_synced'] or 0} mensagens"
        elif job_status == "failed":
            if level and level != "error":
                continue
            lvl = "error"
            msg_text = f"Sync falhou: {job['error_message'] or 'erro desconhecido'}"
        elif job_status == "processing":
            if level and level != "info":
                continue
            lvl = "info"
            msg_text = "Sync em andamento..."
        else:  # pending
            if level and level != "info":
                continue
            lvl = "info"
            msg_text = "Sync pendente na fila"

        logs.append(LogEntry(
            id=f"sync-{job['id']}",
            timestamp=job["processed_at"] or job["created_at"],
            level=lvl,
            source="telegram",
            message=msg_text,
            details={"job_id": job["id"], "status": job_status, "conversation_id": job["conversation_id"]},
        ))

    # 4. Busca mensagens recentes (últimas 24h) como log de atividade
    if not level or level == "info":
        msgs_query = db.table("messages").select(
            "id, channel, direction, sent_at, from_address, to_address"
        ).eq("owner_id", str(owner_id)).order("sent_at", desc=True).limit(50)

        msgs_result = msgs_query.execute()

        for msg in msgs_result.data or []:
            src = msg["channel"] if msg["channel"] in ["telegram", "email", "sms"] else "system"

            if source and source != src:
                continue

            direction = "recebida" if msg["direction"] == "inbound" else "enviada"
            addr = msg.get("from_address") or msg.get("to_address") or ""

            logs.append(LogEntry(
                id=f"msg-{msg['id']}",
                timestamp=msg["sent_at"],
                level="info",
                source=src,
                message=f"Mensagem {direction} via {src}" + (f" ({addr})" if addr else ""),
                details={"message_id": msg["id"], "direction": msg["direction"]},
            ))

    # Filtro por busca
    if search:
        search_lower = search.lower()
        logs = [l for l in logs if search_lower in l.message.lower()]

    # Filtro por data
    if start_date:
        logs = [l for l in logs if l.timestamp >= start_date]
    if end_date:
        logs = [l for l in logs if l.timestamp <= end_date]

    # Ordena por timestamp desc
    logs.sort(key=lambda x: x.timestamp, reverse=True)

    total = len(logs)

    # Paginação
    logs = logs[offset:offset + limit]

    return LogsResponse(logs=logs, total=total)


@router.get("/stats")
async def get_log_stats(
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna estatísticas de logs."""
    # Conta erros em accounts
    errors = db.table("integration_accounts").select(
        "id", count="exact"
    ).eq("owner_id", str(owner_id)).not_.is_("last_error", "null").execute()

    # Conta sync jobs failed
    sync_failed = db.table("sync_history_jobs").select(
        "id", count="exact"
    ).eq("owner_id", str(owner_id)).eq("status", "failed").execute()

    total_errors = (errors.count or 0) + (sync_failed.count or 0)

    # Conta workers online
    hb = db.table("worker_heartbeats").select(
        "id", count="exact"
    ).eq("owner_id", str(owner_id)).eq("status", "online").execute()

    # Conta mensagens últimas 24h
    yesterday = (datetime.utcnow() - timedelta(days=1)).isoformat()
    msgs = db.table("messages").select(
        "id", count="exact"
    ).eq("owner_id", str(owner_id)).gte("sent_at", yesterday).execute()

    # Conta sync jobs pendentes/processing
    sync_pending = db.table("sync_history_jobs").select(
        "id", count="exact"
    ).eq("owner_id", str(owner_id)).in_("status", ["pending", "processing"]).execute()

    return {
        "errors": total_errors,
        "workers_online": hb.count or 0,
        "messages_24h": msgs.count or 0,
        "sync_pending": sync_pending.count or 0,
    }
