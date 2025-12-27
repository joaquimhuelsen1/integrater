from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from uuid import UUID

from app.deps import get_supabase, get_current_user_id
from app.models import Tag, TagCreate, TagUpdate

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[Tag])
async def list_tags(
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    result = db.table("tags").select("*").eq("owner_id", str(owner_id)).execute()
    return result.data


@router.post("", response_model=Tag, status_code=201)
async def create_tag(
    data: TagCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    payload = data.model_dump()
    payload["owner_id"] = str(owner_id)
    result = db.table("tags").insert(payload).execute()
    return result.data[0]


@router.patch("/{tag_id}", response_model=Tag)
async def update_tag(
    tag_id: UUID,
    data: TagUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    payload = data.model_dump(exclude_unset=True)
    result = db.table("tags").update(payload).eq(
        "id", str(tag_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Tag não encontrada")

    return result.data[0]


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(
    tag_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    result = db.table("tags").delete().eq(
        "id", str(tag_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Tag não encontrada")
