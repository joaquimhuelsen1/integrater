from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from uuid import UUID

from app.deps import get_supabase, get_current_user_id
from app.models import (
    Conversation,
    ConversationUpdate,
    ConversationWithDetails,
    ConversationListQuery,
    MergeConversationRequest,
    ChannelType,
    ConversationStatus,
    AddTagRequest,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[Conversation])
async def list_conversations(
    workspace_id: UUID = Query(..., description="ID do workspace"),
    channel: ChannelType | None = None,
    status: ConversationStatus | None = None,
    tag_ids: str | None = None,
    assigned_to: UUID | None = None,
    unlinked: bool | None = None,
    search: str | None = None,
    cursor: UUID | None = None,
    limit: int = Query(default=20, le=100),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    query = db.table("conversations").select("*").eq(
        "owner_id", str(owner_id)
    ).eq("workspace_id", str(workspace_id))

    if channel:
        query = query.eq("channel", channel.value)

    if status:
        query = query.eq("status", status.value)

    if assigned_to:
        query = query.eq("assigned_to", str(assigned_to))

    if unlinked:
        query = query.is_("contact_id", "null")

    if cursor:
        query = query.lt("id", str(cursor))

    result = query.order("last_message_at", desc=True).limit(limit).execute()
    return result.data


@router.get("/{conversation_id}", response_model=ConversationWithDetails)
async def get_conversation(
    conversation_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    result = db.table("conversations").select(
        "*, contact:contacts(*), tags:conversation_tags(tag:tags(*))"
    ).eq("id", str(conversation_id)).eq("owner_id", str(owner_id)).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    return result.data


@router.get("/{conversation_id}/messages")
async def list_messages(
    conversation_id: UUID,
    cursor: UUID | None = None,
    limit: int = Query(default=50, le=100),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    query = db.table("messages").select(
        "*, attachments(*)"
    ).eq("conversation_id", str(conversation_id)).eq("owner_id", str(owner_id)).is_("deleted_at", "null")

    if cursor:
        query = query.lt("id", str(cursor))

    result = query.order("sent_at", desc=True).limit(limit).execute()
    return result.data


@router.patch("/{conversation_id}", response_model=Conversation)
async def update_conversation(
    conversation_id: UUID,
    data: ConversationUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    payload = data.model_dump(exclude_unset=True)
    result = db.table("conversations").update(payload).eq(
        "id", str(conversation_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    return result.data[0]


@router.post("/{conversation_id}/tags", status_code=201)
async def add_tag(
    conversation_id: UUID,
    data: AddTagRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    db.table("conversation_tags").insert({
        "owner_id": str(owner_id),
        "conversation_id": str(conversation_id),
        "tag_id": str(data.tag_id),
    }).execute()

    return {"success": True}


@router.delete("/{conversation_id}/tags/{tag_id}", status_code=204)
async def remove_tag(
    conversation_id: UUID,
    tag_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    db.table("conversation_tags").delete().eq(
        "conversation_id", str(conversation_id)
    ).eq("tag_id", str(tag_id)).eq("owner_id", str(owner_id)).execute()


@router.post("/{conversation_id}/merge", status_code=200)
async def merge_conversations(
    conversation_id: UUID,
    data: MergeConversationRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    # Move mensagens da conversa secundária para a principal
    db.table("messages").update(
        {"conversation_id": str(conversation_id)}
    ).eq("conversation_id", str(data.merge_with_id)).eq("owner_id", str(owner_id)).execute()

    # Remove a conversa secundária
    db.table("conversations").delete().eq(
        "id", str(data.merge_with_id)
    ).eq("owner_id", str(owner_id)).execute()

    return {"success": True}


@router.post("/{conversation_id}/sync-history", status_code=200)
async def sync_conversation_history(
    conversation_id: UUID,
    limit: int = Query(default=500, le=500),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Cria job para sincronizar histórico de mensagens da conversa."""
    # Verifica se conversa existe e pertence ao usuário
    conv_result = db.table("conversations").select(
        "id, last_channel, primary_identity_id"
    ).eq("id", str(conversation_id)).eq("owner_id", str(owner_id)).single().execute()

    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    conv = conv_result.data
    channel = conv.get("last_channel", "telegram")

    # Busca integration_account para o canal
    channel_to_type = {
        "telegram": "telegram_user",
        "email": "email_imap_smtp",
        "openphone_sms": "openphone",
    }
    int_type = channel_to_type.get(channel, "telegram_user")

    int_result = db.table("integration_accounts").select("id").eq(
        "type", int_type
    ).eq("is_active", True).eq("owner_id", str(owner_id)).limit(1).execute()

    int_account_id = int_result.data[0]["id"] if int_result.data else None

    # Verifica se já tem job pendente
    pending = db.table("sync_history_jobs").select("id").eq(
        "conversation_id", str(conversation_id)
    ).eq("status", "pending").limit(1).execute()

    if pending.data:
        return {"success": True, "message": "Sincronização já em andamento", "job_id": pending.data[0]["id"]}

    # Busca workspace_id da conversa
    conv_ws = db.table("conversations").select("workspace_id").eq(
        "id", str(conversation_id)
    ).single().execute()
    ws_id = conv_ws.data.get("workspace_id") if conv_ws.data else None

    # Cria job de sync
    job_result = db.table("sync_history_jobs").insert({
        "owner_id": str(owner_id),
        "workspace_id": ws_id,
        "conversation_id": str(conversation_id),
        "integration_account_id": int_account_id,
        "limit_messages": limit,
        "status": "pending",
    }).execute()

    job_id = job_result.data[0]["id"] if job_result.data else None

    return {"success": True, "message": "Sincronização iniciada", "job_id": job_id}
