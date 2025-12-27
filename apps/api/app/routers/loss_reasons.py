"""
Router Loss Reasons - CRUD de motivos de perda de deals.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from uuid import UUID
from typing import Optional
from pydantic import BaseModel

from app.deps import get_supabase, get_current_user_id


router = APIRouter(prefix="/loss-reasons", tags=["loss-reasons"])


class LossReason(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    color: str = "#ef4444"
    position: int = 0
    is_active: bool = True


class LossReasonCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#ef4444"
    pipeline_id: Optional[str] = None


class LossReasonUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    position: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("", response_model=list[LossReason])
async def list_loss_reasons(
    pipeline_id: Optional[UUID] = None,
    include_inactive: bool = False,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista motivos de perda."""
    query = db.table("loss_reasons").select("*").eq("owner_id", str(owner_id))

    if pipeline_id:
        # Motivos do pipeline específico OU globais (pipeline_id = null)
        query = query.or_(f"pipeline_id.eq.{pipeline_id},pipeline_id.is.null")

    if not include_inactive:
        query = query.eq("is_active", True)

    result = query.order("position").execute()
    return result.data


@router.post("", response_model=LossReason, status_code=201)
async def create_loss_reason(
    data: LossReasonCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Cria novo motivo de perda."""
    # Calcula próxima posição
    existing = db.table("loss_reasons").select("position").eq(
        "owner_id", str(owner_id)
    ).order("position", desc=True).limit(1).execute()

    next_position = (existing.data[0]["position"] + 1) if existing.data else 0

    payload = {
        "owner_id": str(owner_id),
        "name": data.name,
        "description": data.description,
        "color": data.color or "#ef4444",
        "position": next_position,
    }

    if data.pipeline_id:
        payload["pipeline_id"] = data.pipeline_id

    result = db.table("loss_reasons").insert(payload).execute()
    return result.data[0]


@router.patch("/{reason_id}", response_model=LossReason)
async def update_loss_reason(
    reason_id: UUID,
    data: LossReasonUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Atualiza motivo de perda."""
    payload = data.model_dump(exclude_unset=True)

    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    result = db.table("loss_reasons").update(payload).eq(
        "id", str(reason_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Motivo não encontrado")

    return result.data[0]


@router.delete("/{reason_id}", status_code=204)
async def delete_loss_reason(
    reason_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Remove motivo de perda (soft delete - desativa)."""
    result = db.table("loss_reasons").update(
        {"is_active": False}
    ).eq("id", str(reason_id)).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Motivo não encontrado")
