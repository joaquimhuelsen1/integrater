"""
Router Webhooks - Recebe dados externos para criar deals.
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from supabase import Client
from pydantic import BaseModel
from typing import Any
import random

from app.deps import get_supabase

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def generate_tag_color() -> str:
    """Gera uma cor aleatória para tag."""
    colors = [
        "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
        "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
        "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
        "#ec4899", "#f43f5e"
    ]
    return random.choice(colors)


class WebhookDealCreate(BaseModel):
    """Payload para criar deal via webhook."""
    title: str
    value: float = 0
    stage_id: str | None = None  # Se não informar, usa primeiro stage
    contact_id: str | None = None
    info: str | None = None  # Informações formatadas
    custom_fields: dict[str, Any] = {}
    tags: list[str] = []  # Lista de nomes de tags (cria se não existir)


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

    # Processa tags (cria se não existir e associa ao deal)
    tags_added = []
    for tag_name in data.tags:
        tag_name = tag_name.strip()
        if not tag_name:
            continue

        # Busca tag existente
        existing_tag = db.table("deal_tags").select("id").eq(
            "owner_id", owner_id
        ).eq("name", tag_name).execute()

        if existing_tag.data:
            tag_id = existing_tag.data[0]["id"]
        else:
            # Cria nova tag
            new_tag = db.table("deal_tags").insert({
                "owner_id": owner_id,
                "name": tag_name,
                "color": generate_tag_color()
            }).execute()
            tag_id = new_tag.data[0]["id"]

        # Associa tag ao deal (ignora se já existe)
        try:
            db.table("deal_tag_assignments").insert({
                "deal_id": deal["id"],
                "tag_id": tag_id
            }).execute()
            tags_added.append(tag_name)
        except Exception:
            pass  # Já existe

    return {
        "success": True,
        "deal_id": deal["id"],
        "tags_added": tags_added,
        "message": "Deal criado com sucesso"
    }
