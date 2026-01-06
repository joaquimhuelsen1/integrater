"""
Router Webhooks - Recebe dados externos para criar deals.
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from supabase import Client
from pydantic import BaseModel
from typing import Any

from app.deps import get_supabase

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


class WebhookDealCreate(BaseModel):
    """Payload para criar deal via webhook."""
    title: str
    value: float = 0
    stage_id: str | None = None  # Se não informar, usa primeiro stage
    contact_id: str | None = None
    info: str | None = None  # Informações formatadas
    custom_fields: dict[str, Any] = {}


@router.post("/deals", status_code=201)
async def create_deal_via_webhook(
    data: WebhookDealCreate,
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: Client = Depends(get_supabase),
):
    """
    Cria um deal via webhook usando API key.
    
    Headers:
        X-API-Key: API key do pipeline
    
    Body:
        title: Nome do deal (obrigatório)
        value: Valor do deal (opcional, default 0)
        stage_id: ID do stage (opcional, default primeiro stage)
        contact_id: ID do contato (opcional)
        info: Informações formatadas (opcional)
        custom_fields: Campos customizados (opcional)
    """
    # Busca API key e pipeline associado
    api_key_result = db.table("pipeline_api_keys").select(
        "pipeline_id"
    ).eq("api_key", x_api_key).execute()

    if not api_key_result.data:
        raise HTTPException(status_code=401, detail="API key inválida")

    pipeline_id = api_key_result.data[0]["pipeline_id"]

    # Busca pipeline para pegar owner_id
    pipeline_result = db.table("pipelines").select(
        "owner_id"
    ).eq("id", pipeline_id).single().execute()

    if not pipeline_result.data:
        raise HTTPException(status_code=404, detail="Pipeline não encontrado")

    owner_id = pipeline_result.data["owner_id"]

    # Determina stage_id
    stage_id = data.stage_id
    if not stage_id:
        # Busca primeiro stage do pipeline (menor position)
        stages_result = db.table("stages").select("id").eq(
            "pipeline_id", pipeline_id
        ).order("position").limit(1).execute()

        if not stages_result.data:
            raise HTTPException(
                status_code=400,
                detail="Pipeline não tem stages configurados"
            )
        stage_id = stages_result.data[0]["id"]
    else:
        # Verifica se stage pertence ao pipeline
        stage_check = db.table("stages").select("id").eq(
            "id", stage_id
        ).eq("pipeline_id", pipeline_id).execute()

        if not stage_check.data:
            raise HTTPException(
                status_code=400,
                detail="Stage não pertence ao pipeline"
            )

    # Cria o deal
    deal_payload = {
        "owner_id": owner_id,
        "pipeline_id": pipeline_id,
        "stage_id": stage_id,
        "title": data.title,
        "value": data.value,
        "info": data.info,
        "custom_fields": data.custom_fields,
    }

    if data.contact_id:
        deal_payload["contact_id"] = data.contact_id

    result = db.table("deals").insert(deal_payload).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao criar deal")

    deal = result.data[0]

    # Cria activity de criação
    db.table("deal_activities").insert({
        "owner_id": owner_id,
        "deal_id": deal["id"],
        "activity_type": "created",
        "content": f"Deal criado via API: {data.title}",
    }).execute()

    return {
        "success": True,
        "deal_id": deal["id"],
        "message": "Deal criado com sucesso"
    }
