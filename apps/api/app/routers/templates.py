from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from uuid import UUID

from app.deps import get_supabase, get_current_user_id
from app.models import Template, TemplateCreate, TemplateUpdate

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[Template])
async def list_templates(
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    result = db.table("templates").select("*").eq("owner_id", str(owner_id)).execute()
    return result.data


@router.post("", response_model=Template, status_code=201)
async def create_template(
    data: TemplateCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    payload = data.model_dump()
    payload["owner_id"] = str(owner_id)
    result = db.table("templates").insert(payload).execute()
    return result.data[0]


@router.patch("/{template_id}", response_model=Template)
async def update_template(
    template_id: UUID,
    data: TemplateUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    payload = data.model_dump(exclude_unset=True)
    result = db.table("templates").update(payload).eq(
        "id", str(template_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Template não encontrado")

    return result.data[0]


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    result = db.table("templates").delete().eq(
        "id", str(template_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Template não encontrado")
