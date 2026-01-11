"""
Router Preferences - Preferencias de dashboard do usuario.
"""
from fastapi import APIRouter, Depends
from supabase import Client
from pydantic import BaseModel
from uuid import UUID
from typing import Literal
from datetime import datetime, timezone

from app.deps import get_supabase, get_current_user_id

router = APIRouter(prefix="/preferences", tags=["preferences"])


class DashboardBlock(BaseModel):
    id: str
    title: str
    size: Literal["small", "medium", "large"]


class DashboardLayoutRequest(BaseModel):
    layout: list[DashboardBlock]


class DashboardLayoutResponse(BaseModel):
    layout: list[DashboardBlock]


@router.get("/dashboard/{dashboard_type}", response_model=DashboardLayoutResponse)
async def get_dashboard_layout(
    dashboard_type: str,
    db: Client = Depends(get_supabase),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna layout do dashboard do usuario.
    Se nao existir, retorna layout vazio.
    """
    result = db.table("user_dashboard_preferences").select("layout").eq(
        "user_id", str(user_id)
    ).eq("dashboard_type", dashboard_type).execute()

    if result.data and len(result.data) > 0:
        layout_data = result.data[0].get("layout", [])
        return DashboardLayoutResponse(layout=layout_data)

    return DashboardLayoutResponse(layout=[])


@router.put("/dashboard/{dashboard_type}", response_model=DashboardLayoutResponse)
async def save_dashboard_layout(
    dashboard_type: str,
    request: DashboardLayoutRequest,
    db: Client = Depends(get_supabase),
    user_id: UUID = Depends(get_current_user_id),
):
    """
    Salva layout do dashboard do usuario (upsert).
    """
    layout_data = [block.model_dump() for block in request.layout]
    now = datetime.now(timezone.utc).isoformat()

    # Upsert: INSERT ON CONFLICT UPDATE
    db.table("user_dashboard_preferences").upsert(
        {
            "user_id": str(user_id),
            "dashboard_type": dashboard_type,
            "layout": layout_data,
            "updated_at": now,
        },
        on_conflict="user_id,dashboard_type",
    ).execute()

    return DashboardLayoutResponse(layout=request.layout)
