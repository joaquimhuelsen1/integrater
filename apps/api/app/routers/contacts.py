from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from uuid import UUID
from datetime import datetime

from app.deps import get_supabase, get_current_user_id
from app.models import (
    Contact,
    ContactCreate,
    ContactUpdate,
    ContactWithIdentities,
    LinkIdentityRequest,
    UnlinkIdentityRequest,
)

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", response_model=list[Contact])
async def list_contacts(
    workspace_id: UUID = Query(..., description="ID do workspace"),
    search: str | None = None,
    cursor: UUID | None = None,
    limit: int = Query(default=50, le=100),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    query = db.table("contacts").select("*").eq(
        "owner_id", str(owner_id)
    ).eq("workspace_id", str(workspace_id)).is_("deleted_at", "null")

    if search:
        query = query.ilike("display_name", f"%{search}%")

    if cursor:
        query = query.lt("id", str(cursor))

    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data


@router.post("", response_model=Contact, status_code=201)
async def create_contact(
    data: ContactCreate,
    workspace_id: UUID = Query(..., description="ID do workspace"),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    payload = data.model_dump()
    payload["owner_id"] = str(owner_id)
    payload["workspace_id"] = str(workspace_id)
    result = db.table("contacts").insert(payload).execute()
    return result.data[0]


@router.get("/{contact_id}", response_model=ContactWithIdentities)
async def get_contact(
    contact_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    result = db.table("contacts").select(
        "*, identities:contact_identities(*)"
    ).eq("id", str(contact_id)).eq("owner_id", str(owner_id)).is_("deleted_at", "null").single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Contato não encontrado")

    return result.data


@router.patch("/{contact_id}", response_model=Contact)
async def update_contact(
    contact_id: UUID,
    data: ContactUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    payload = data.model_dump(exclude_unset=True)
    result = db.table("contacts").update(payload).eq(
        "id", str(contact_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Contato não encontrado")

    return result.data[0]


@router.delete("/{contact_id}", status_code=204)
async def delete_contact(
    contact_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    result = db.table("contacts").update(
        {"deleted_at": datetime.utcnow().isoformat()}
    ).eq("id", str(contact_id)).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Contato não encontrado")


@router.post("/{contact_id}/link-identity", status_code=204)
async def link_identity(
    contact_id: UUID,
    data: LinkIdentityRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    # 1. Atualiza identity com contact_id
    db.table("contact_identities").update(
        {"contact_id": str(contact_id)}
    ).eq("id", str(data.identity_id)).eq("owner_id", str(owner_id)).execute()

    # 2. Atualiza conversas que usam essa identity
    try:
        db.table("conversations").update(
            {"contact_id": str(contact_id)}
        ).eq("primary_identity_id", str(data.identity_id)).eq("owner_id", str(owner_id)).execute()
    except Exception as e:
        error_msg = str(e)
        if "conversations_owner_contact_channel_uniq" in error_msg or "23505" in error_msg:
            raise HTTPException(
                status_code=409,
                detail="Este contato já está vinculado a outra conversa neste canal"
            )
        raise


@router.post("/{contact_id}/unlink-identity", status_code=204)
async def unlink_identity(
    contact_id: UUID,
    data: UnlinkIdentityRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    db.table("contact_identities").update(
        {"contact_id": None}
    ).eq("id", str(data.identity_id)).eq("owner_id", str(owner_id)).execute()
