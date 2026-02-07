"""
Router Webhooks - Recebe dados externos para criar deals.
Endpoint: POST /webhooks/{workspace_id}/deals
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Path
from supabase import Client
from pydantic import BaseModel
from typing import Any
import asyncio
import os
import random
import logging
import httpx

from app.deps import get_supabase
from app.services.contact_service import get_contact_service

logger = logging.getLogger(__name__)

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
    contact_id: str | None = None

    # Campos estruturados (enviados pelo n8n)
    email_compra: str | None = None
    telefone_contato: str | None = None
    nome_completo: str | None = None

    # Campos genéricos
    info: str | None = None
    custom_fields: dict[str, Any] = {}
    tags: list[str] = []


@router.post("/{workspace_id}/deals", status_code=201)
async def create_deal_via_workspace_webhook(
    data: WebhookDealCreate,
    workspace_id: str = Path(..., description="ID do workspace (UUID)"),
    x_api_key: str = Header(..., alias="X-API-Key"),
    x_pipeline_id: str | None = Header(None, alias="X-Pipeline-Id"),
    x_stage_id: str | None = Header(None, alias="X-Stage-Id"),
    db: Client = Depends(get_supabase),
):
    """
    Cria um deal via webhook usando API key do workspace.

    URL: POST /webhooks/{workspace_id}/deals

    Headers:
        X-API-Key: API key do workspace (obrigatório)
        X-Pipeline-Id: ID do pipeline (opcional, default primeiro pipeline)
        X-Stage-Id: ID do stage (opcional, default primeiro stage)

    Body:
        title: Nome do deal (obrigatório)
        value: Valor do deal (opcional, default 0)
        contact_id: ID do contato (opcional)
        email_compra: Email de compra (opcional, vai para custom_fields)
        telefone_contato: Telefone de contato (opcional, vai para custom_fields)
        nome_completo: Nome completo (opcional, vai para custom_fields)
        info: Informações formatadas (opcional)
        custom_fields: Campos customizados genéricos (opcional)
        tags: Lista de nomes de tags (cria automaticamente se não existir)

    Exemplo de payload:
        {
            "title": "Venda - João Silva",
            "value": 1500.00,
            "email_compra": "joao@email.com",
            "telefone_contato": "+5511999999999",
            "nome_completo": "João da Silva",
            "tags": ["hotmart", "curso-x"]
        }

    Nota: Campos estruturados (email_compra, telefone_contato, nome_completo)
    são mesclados em custom_fields. Se houver conflito com campos genéricos
    em custom_fields, os campos estruturados prevalecem.
    """
    # Valida workspace existe
    workspace_result = db.table("workspaces").select(
        "id, owner_id"
    ).eq("id", workspace_id).execute()

    if not workspace_result.data:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    workspace = workspace_result.data[0]
    owner_id = workspace["owner_id"]

    # Valida API key do workspace
    api_key_result = db.table("workspace_api_keys").select(
        "workspace_id"
    ).eq("api_key", x_api_key).eq("workspace_id", workspace_id).execute()

    if not api_key_result.data:
        raise HTTPException(status_code=401, detail="API key inválida para este workspace")

    # Determina pipeline_id
    pipeline_id = x_pipeline_id
    if not pipeline_id:
        # Busca primeiro pipeline do workspace
        pipelines_result = db.table("pipelines").select("id").eq(
            "workspace_id", workspace_id
        ).eq("is_archived", False).order("created_at").limit(1).execute()

        if not pipelines_result.data:
            raise HTTPException(
                status_code=400,
                detail="Workspace não tem pipelines configurados"
            )
        pipeline_id = pipelines_result.data[0]["id"]
    else:
        # Verifica se pipeline pertence ao workspace
        pipeline_check = db.table("pipelines").select("id").eq(
            "id", pipeline_id
        ).eq("workspace_id", workspace_id).execute()

        if not pipeline_check.data:
            raise HTTPException(
                status_code=400,
                detail="Pipeline não pertence ao workspace"
            )

    # Determina stage_id
    stage_id = x_stage_id
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

    # Mescla campos estruturados em custom_fields
    merged_custom_fields = {
        **data.custom_fields,  # Campos genéricos primeiro
    }
    # Adiciona campos estruturados se existirem (sobrescrevem genéricos)
    if data.email_compra:
        merged_custom_fields["email_compra"] = data.email_compra
    if data.telefone_contato:
        merged_custom_fields["telefone_contato"] = data.telefone_contato
    if data.nome_completo:
        merged_custom_fields["nome_completo"] = data.nome_completo

    # Cria o deal
    deal_payload = {
        "owner_id": owner_id,
        "pipeline_id": pipeline_id,
        "stage_id": stage_id,
        "title": data.title,
        "value": data.value,
        "info": data.info,
        "custom_fields": merged_custom_fields,
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
        "content": f"Deal criado via webhook: {data.title}",
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

    # Auto-vincular contato se email_compra estiver presente e deal nao tiver contact_id
    contact_linked = None
    if not data.contact_id:
        email_compra = merged_custom_fields.get("email_compra")

        if email_compra and isinstance(email_compra, str) and "@" in email_compra:
            try:
                service = get_contact_service(db, owner_id, workspace_id)

                # Buscar nome do custom_fields se existir
                nome_completo = merged_custom_fields.get("nome_completo")

                contact_result = await service.get_or_create_by_email(
                    email=email_compra,
                    display_name=nome_completo,
                    metadata={"source": "crm_webhook", "deal_title": data.title}
                )

                # Atualizar deal com contact_id
                db.table("deals").update({
                    "contact_id": contact_result["contact"]["id"]
                }).eq("id", deal["id"]).execute()

                contact_linked = contact_result["contact"]["id"]
                logger.info(f"Deal {deal['id']} linked to contact {contact_linked}")
            except Exception as e:
                logger.warning(f"Failed to auto-link contact for deal {deal['id']}: {e}")

    # Fire-and-forget: trigger n8n para calcular lead score via IA
    n8n_lead_score_url = os.environ.get("N8N_LEAD_SCORE_WEBHOOK_URL")
    if n8n_lead_score_url:
        async def _trigger_lead_score():
            try:
                async with httpx.AsyncClient() as client:
                    await client.post(
                        n8n_lead_score_url,
                        json={
                            "deal_id": deal["id"],
                            "workspace_id": workspace_id,
                            "owner_id": owner_id,
                            "custom_fields": merged_custom_fields,
                            "title": data.title,
                            "value": data.value,
                            "tags": tags_added,
                            "contact_linked": contact_linked,
                        },
                        timeout=10.0,
                    )
            except Exception as e:
                logger.warning(f"Failed to trigger lead score for deal {deal['id']}: {e}")

        asyncio.create_task(_trigger_lead_score())

    return {
        "success": True,
        "deal_id": deal["id"],
        "pipeline_id": pipeline_id,
        "stage_id": stage_id,
        "tags_added": tags_added,
        "contact_linked": contact_linked,
        "message": "Deal criado com sucesso"
    }


class Digistore24WebhookPayload(BaseModel):
    """Payload do webhook Digistore24 - campos principais."""
    event: str  # "completed", "refunded", etc
    order_id: str
    product_id: str
    product_name: str
    email: str
    first_name: str | None = None
    last_name: str | None = None
    amount: float
    currency: str = "EUR"

    class Config:
        extra = "allow"  # Permitir campos extras do payload


@router.post("/{workspace_id}/digistore24")
async def digistore24_webhook(
    workspace_id: str,
    payload: Digistore24WebhookPayload,
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: Client = Depends(get_supabase)
):
    """
    Webhook para receber compras do Digistore24.
    Cria/vincula contato automaticamente pelo email.
    Registra compra na tabela purchases.
    """
    # Validar API key do workspace
    api_key_result = db.table("workspace_api_keys").select("owner_id").eq(
        "workspace_id", workspace_id
    ).eq("api_key", x_api_key).execute()

    if not api_key_result.data:
        raise HTTPException(status_code=401, detail="Invalid API key")

    owner_id = api_key_result.data[0]["owner_id"]

    # Usar ContactService para get_or_create contato
    service = get_contact_service(db, owner_id, workspace_id)

    display_name = None
    if payload.first_name or payload.last_name:
        display_name = f"{payload.first_name or ''} {payload.last_name or ''}".strip()

    contact_result = await service.get_or_create_by_email(
        email=payload.email,
        display_name=display_name,
        metadata={"source": "digistore24", "first_purchase": payload.product_name}
    )

    # Registrar compra na tabela purchases
    purchase_data = {
        "owner_id": owner_id,
        "workspace_id": workspace_id,
        "contact_id": contact_result["contact"]["id"],
        "email": payload.email.lower(),
        "product_name": payload.product_name,
        "product_id": payload.product_id,
        "order_id": payload.order_id,
        "amount": payload.amount,
        "currency": payload.currency,
        "source": "digistore24",
        "source_data": payload.model_dump(),
        "status": payload.event
    }

    # Upsert por order_id (para evitar duplicatas)
    db.table("purchases").upsert(
        purchase_data,
        on_conflict="order_id"
    ).execute()

    logger.info(f"Digistore24 webhook processed: order={payload.order_id}, contact={contact_result['contact']['id']}")

    return {
        "success": True,
        "contact_id": contact_result["contact"]["id"],
        "is_new_contact": contact_result["is_new"],
        "order_id": payload.order_id
    }