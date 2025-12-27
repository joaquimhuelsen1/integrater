"""
Router Deal Tags - CRUD de tags para deals.
"""
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from uuid import UUID

from app.deps import get_supabase, get_current_user_id
from app.models.crm import DealTag, DealTagCreate, DealTagUpdate

router = APIRouter(prefix="/deal-tags", tags=["deal-tags"])


@router.get("", response_model=list[DealTag])
async def list_tags(
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista todas as tags do usuário."""
    result = db.table("deal_tags").select("*").eq(
        "owner_id", str(owner_id)
    ).order("name").execute()
    return result.data


@router.post("", response_model=DealTag, status_code=201)
async def create_tag(
    data: DealTagCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Cria nova tag."""
    payload = data.model_dump(mode="json")
    payload["owner_id"] = str(owner_id)

    result = db.table("deal_tags").insert(payload).execute()
    return result.data[0]


@router.patch("/{tag_id}", response_model=DealTag)
async def update_tag(
    tag_id: UUID,
    data: DealTagUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Atualiza tag."""
    payload = data.model_dump(exclude_unset=True, mode="json")

    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    result = db.table("deal_tags").update(payload).eq(
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
    """Remove tag."""
    result = db.table("deal_tags").delete().eq(
        "id", str(tag_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Tag não encontrada")
