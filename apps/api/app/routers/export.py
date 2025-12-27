"""
Router Export - Exportação de dados em JSON e CSV (M9).
"""

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from supabase import Client
from uuid import UUID
from typing import Optional
from datetime import datetime
import csv
import io
import json

from ..deps import get_supabase, get_current_user_id


router = APIRouter(prefix="/export", tags=["export"])


@router.get("/conversations/json")
async def export_conversations_json(
    status: Optional[str] = None,
    channel: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Exporta conversas e mensagens em JSON."""
    # Busca conversas
    query = db.table("conversations").select(
        "*, contact:contacts(id, name, email, phone), messages(*)"
    ).eq("owner_id", str(owner_id))

    if status:
        query = query.eq("status", status)

    if channel:
        query = query.eq("last_channel", channel)

    result = query.order("last_message_at", desc=True).execute()

    conversations = result.data or []

    # Filtra por data se especificado
    if start_date or end_date:
        filtered = []
        for conv in conversations:
            last_msg = conv.get("last_message_at", "")
            if start_date and last_msg < start_date:
                continue
            if end_date and last_msg > end_date:
                continue
            filtered.append(conv)
        conversations = filtered

    export_data = {
        "exported_at": datetime.utcnow().isoformat(),
        "total_conversations": len(conversations),
        "conversations": conversations,
    }

    # Retorna como download
    json_str = json.dumps(export_data, indent=2, ensure_ascii=False, default=str)

    return Response(
        content=json_str,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=conversas_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        }
    )


@router.get("/conversations/csv")
async def export_conversations_csv(
    status: Optional[str] = None,
    channel: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Exporta conversas em CSV (sem mensagens, apenas metadados)."""
    # Busca conversas
    query = db.table("conversations").select(
        "id, status, last_channel, last_message_at, created_at, contact:contacts(name, email, phone)"
    ).eq("owner_id", str(owner_id))

    if status:
        query = query.eq("status", status)

    if channel:
        query = query.eq("last_channel", channel)

    result = query.order("last_message_at", desc=True).execute()

    conversations = result.data or []

    # Filtra por data se especificado
    if start_date or end_date:
        filtered = []
        for conv in conversations:
            last_msg = conv.get("last_message_at", "")
            if start_date and last_msg < start_date:
                continue
            if end_date and last_msg > end_date:
                continue
            filtered.append(conv)
        conversations = filtered

    # Cria CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "ID", "Status", "Canal", "Última Mensagem", "Criado Em",
        "Contato Nome", "Contato Email", "Contato Telefone"
    ])

    # Rows
    for conv in conversations:
        contact = conv.get("contact") or {}
        writer.writerow([
            conv["id"],
            conv["status"],
            conv["last_channel"],
            conv["last_message_at"],
            conv["created_at"],
            contact.get("name", ""),
            contact.get("email", ""),
            contact.get("phone", ""),
        ])

    csv_content = output.getvalue()
    output.close()

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=conversas_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
        }
    )


@router.get("/messages/json")
async def export_messages_json(
    conversation_id: Optional[UUID] = None,
    channel: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(default=1000, le=5000),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Exporta mensagens em JSON."""
    query = db.table("messages").select("*").eq("owner_id", str(owner_id))

    if conversation_id:
        query = query.eq("conversation_id", str(conversation_id))

    if channel:
        query = query.eq("channel", channel)

    if start_date:
        query = query.gte("sent_at", start_date)

    if end_date:
        query = query.lte("sent_at", end_date)

    result = query.order("sent_at", desc=True).limit(limit).execute()

    messages = result.data or []

    export_data = {
        "exported_at": datetime.utcnow().isoformat(),
        "total_messages": len(messages),
        "messages": messages,
    }

    json_str = json.dumps(export_data, indent=2, ensure_ascii=False, default=str)

    return Response(
        content=json_str,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=mensagens_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        }
    )


@router.get("/messages/csv")
async def export_messages_csv(
    conversation_id: Optional[UUID] = None,
    channel: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(default=1000, le=5000),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Exporta mensagens em CSV."""
    query = db.table("messages").select(
        "id, conversation_id, channel, direction, text, from_address, to_address, sent_at"
    ).eq("owner_id", str(owner_id))

    if conversation_id:
        query = query.eq("conversation_id", str(conversation_id))

    if channel:
        query = query.eq("channel", channel)

    if start_date:
        query = query.gte("sent_at", start_date)

    if end_date:
        query = query.lte("sent_at", end_date)

    result = query.order("sent_at", desc=True).limit(limit).execute()

    messages = result.data or []

    # Cria CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "ID", "Conversa ID", "Canal", "Direção", "Texto",
        "De", "Para", "Enviado Em"
    ])

    # Rows
    for msg in messages:
        # Limpa texto para CSV (remove quebras de linha)
        text = (msg.get("text") or "").replace("\n", " ").replace("\r", "")[:500]

        writer.writerow([
            msg["id"],
            msg["conversation_id"],
            msg["channel"],
            msg["direction"],
            text,
            msg.get("from_address", ""),
            msg.get("to_address", ""),
            msg["sent_at"],
        ])

    csv_content = output.getvalue()
    output.close()

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=mensagens_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
        }
    )


@router.get("/contacts/csv")
async def export_contacts_csv(
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Exporta contatos em CSV."""
    result = db.table("contacts").select("*").eq("owner_id", str(owner_id)).execute()

    contacts = result.data or []

    # Cria CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "ID", "Nome", "Email", "Telefone", "Empresa", "Notas", "Criado Em"
    ])

    # Rows
    for contact in contacts:
        writer.writerow([
            contact["id"],
            contact.get("name", ""),
            contact.get("email", ""),
            contact.get("phone", ""),
            contact.get("company", ""),
            (contact.get("notes") or "").replace("\n", " ")[:200],
            contact["created_at"],
        ])

    csv_content = output.getvalue()
    output.close()

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=contatos_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
        }
    )
