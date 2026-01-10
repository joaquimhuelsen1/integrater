"""
Router Deals - CRUD de deals, produtos e atividades (CRM).
"""
import os
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from uuid import UUID, uuid4
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Literal
from pydantic import BaseModel, field_validator, model_validator
import httpx

from app.deps import get_supabase, get_current_user_id
from app.models.enums import AutomationTriggerType
from app.services.automation_executor import AutomationExecutor
from app.models.crm import (
    Deal,
    DealCreate,
    DealUpdate,
    DealWithDetails,
    DealMoveRequest,
    DealLoseRequest,
    DealProduct,
    DealProductCreate,
    DealActivity,
    DealActivityCreate,
    DealActivityUpdate,
    DealFile,
    DealFileCreate,
    DealTag,
)

router = APIRouter(prefix="/deals", tags=["deals"])


# ============================================
# Deals
# ============================================
@router.get("", response_model=list[Deal])
async def list_deals(
    pipeline_id: Optional[UUID] = None,
    stage_id: Optional[UUID] = None,
    contact_id: Optional[UUID] = None,
    min_value: Optional[Decimal] = None,
    max_value: Optional[Decimal] = None,
    include_archived: bool = False,
    include_closed: bool = True,
    limit: int = Query(default=100, le=500),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista deals com filtros."""
    query = db.table("deals").select("*").eq("owner_id", str(owner_id))

    if pipeline_id:
        query = query.eq("pipeline_id", str(pipeline_id))

    if stage_id:
        query = query.eq("stage_id", str(stage_id))

    if contact_id:
        query = query.eq("contact_id", str(contact_id))

    if min_value is not None:
        query = query.gte("value", float(min_value))

    if max_value is not None:
        query = query.lte("value", float(max_value))

    if not include_archived:
        query = query.is_("archived_at", "null")

    if not include_closed:
        query = query.is_("won_at", "null").is_("lost_at", "null")

    result = query.order("updated_at", desc=True).limit(limit).execute()
    return result.data


@router.get("/by-pipeline/{pipeline_id}")
async def list_deals_by_pipeline(
    pipeline_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista deals agrupados por stage (para Kanban)."""
    # Busca stages
    stages_result = db.table("stages").select("*").eq(
        "pipeline_id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).order("position").execute()

    # Busca deals do pipeline (não arquivados)
    deals_result = db.table("deals").select(
        "*, contact:contacts(id, display_name)"
    ).eq("pipeline_id", str(pipeline_id)).eq(
        "owner_id", str(owner_id)
    ).is_("archived_at", "null").order("updated_at", desc=True).execute()

    # Busca todas as tags associadas aos deals deste pipeline
    deal_ids = [d["id"] for d in (deals_result.data or [])]
    deal_tags_map = {}
    if deal_ids:
        tags_result = db.table("deal_tag_assignments").select(
            "deal_id, deal_tags(id, name, color)"
        ).in_("deal_id", deal_ids).execute()
        
        for link in (tags_result.data or []):
            deal_id = link["deal_id"]
            tag = link.get("deal_tags")
            if tag:
                if deal_id not in deal_tags_map:
                    deal_tags_map[deal_id] = []
                deal_tags_map[deal_id].append(tag)

    # Agrupa por stage e adiciona tags
    deals_by_stage = {}
    for deal in deals_result.data or []:
        deal["tags"] = deal_tags_map.get(deal["id"], [])
        stage_id = deal["stage_id"]
        if stage_id not in deals_by_stage:
            deals_by_stage[stage_id] = []
        deals_by_stage[stage_id].append(deal)

    # Monta resposta
    result = []
    for stage in stages_result.data or []:
        stage["deals"] = deals_by_stage.get(stage["id"], [])
        result.append(stage)

    return result


@router.post("", response_model=Deal, status_code=201)
async def create_deal(
    data: DealCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Cria novo deal."""
    # Verifica constraint de 1 deal ativo por contato
    if data.contact_id:
        existing = db.table("deals").select("id").eq(
            "owner_id", str(owner_id)
        ).eq("contact_id", str(data.contact_id)).is_(
            "archived_at", "null"
        ).is_("won_at", "null").is_("lost_at", "null").limit(1).execute()

        if existing.data:
            raise HTTPException(
                status_code=400,
                detail="Este contato já possui um deal ativo"
            )

    # Verifica se stage pertence ao pipeline
    stage = db.table("stages").select("id").eq(
        "id", str(data.stage_id)
    ).eq("pipeline_id", str(data.pipeline_id)).single().execute()

    if not stage.data:
        raise HTTPException(status_code=400, detail="Stage não pertence ao pipeline")

    payload = data.model_dump(mode="json")
    payload["owner_id"] = str(owner_id)

    result = db.table("deals").insert(payload).execute()
    deal = result.data[0]

    # Cria activity de criação
    db.table("deal_activities").insert({
        "owner_id": str(owner_id),
        "deal_id": deal["id"],
        "activity_type": "created",
        "content": f"Deal criado: {data.title}",
    }).execute()

    return deal


@router.get("/{deal_id}", response_model=DealWithDetails)
async def get_deal(
    deal_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna deal com detalhes."""
    result = db.table("deals").select(
        "*, stage:stages(*), contact:contacts(id, display_name, lead_stage, metadata)"
    ).eq("id", str(deal_id)).eq("owner_id", str(owner_id)).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")

    # Busca produtos
    products = db.table("deal_products").select("*").eq(
        "deal_id", str(deal_id)
    ).execute()

    deal = result.data
    deal["products"] = products.data or []
    deal["products_total"] = sum(
        Decimal(str(p["value"])) for p in deal["products"]
    )

    return deal


@router.patch("/{deal_id}", response_model=Deal)
async def update_deal(
    deal_id: UUID,
    data: DealUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Atualiza deal."""
    payload = data.model_dump(exclude_unset=True, mode="json")

    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    # Busca deal atual para comparar mudanças
    current = db.table("deals").select("*").eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not current.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")

    old_deal = current.data

    # Se mudando stage, verifica se pertence ao mesmo pipeline
    if "stage_id" in payload:
        stage = db.table("stages").select("id").eq(
            "id", payload["stage_id"]
        ).eq("pipeline_id", old_deal["pipeline_id"]).single().execute()

        if not stage.data:
            raise HTTPException(
                status_code=400,
                detail="Stage não pertence ao pipeline do deal"
            )

    # Atualiza deal
    result = db.table("deals").update(payload).eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")

    # Registra mudanças de campos importantes
    tracked_fields = {
        "value": "Valor",
        "probability": "Probabilidade",
        "expected_close_date": "Previsão de Fechamento",
        "title": "Título",
    }

    for field, label in tracked_fields.items():
        if field in payload:
            old_val = old_deal.get(field)
            new_val = payload.get(field)

            # Converte para string para comparação
            old_str = str(old_val) if old_val is not None else ""
            new_str = str(new_val) if new_val is not None else ""

            if old_str != new_str:
                # Formata valores para exibição
                if field == "value":
                    old_display = f"R$ {float(old_val or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                    new_display = f"R$ {float(new_val or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                elif field == "probability":
                    old_display = f"{old_val or 0}%"
                    new_display = f"{new_val or 0}%"
                else:
                    old_display = old_str or "(vazio)"
                    new_display = new_str or "(vazio)"

                db.table("deal_activities").insert({
                    "owner_id": str(owner_id),
                    "deal_id": str(deal_id),
                    "activity_type": "field_change",
                    "field_name": label,
                    "old_value": old_display,
                    "new_value": new_display,
                }).execute()

    # Se mudou stage via update (não via /move), registra
    if "stage_id" in payload and payload["stage_id"] != old_deal.get("stage_id"):
        db.table("deal_activities").insert({
            "owner_id": str(owner_id),
            "deal_id": str(deal_id),
            "activity_type": "stage_change",
            "from_stage_id": old_deal.get("stage_id"),
            "to_stage_id": payload["stage_id"],
        }).execute()

    return result.data[0]


@router.post("/{deal_id}/archive", status_code=204)
async def archive_deal(
    deal_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Arquiva deal (soft delete)."""
    result = db.table("deals").update(
        {"archived_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", str(deal_id)).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")


@router.delete("/{deal_id}", status_code=204)
async def delete_deal(
    deal_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Exclui deal permanentemente."""
    result = db.table("deals").delete().eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")


@router.post("/{deal_id}/move", response_model=Deal)
async def move_deal(
    deal_id: UUID,
    data: DealMoveRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Move deal para outra stage."""
    # Busca deal atual
    deal = db.table("deals").select("pipeline_id, stage_id").eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not deal.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")

    old_stage_id = deal.data["stage_id"]
    new_stage_id = str(data.stage_id)

    # Se é a mesma stage, não faz nada
    if old_stage_id == new_stage_id:
        result = db.table("deals").select("*").eq("id", str(deal_id)).single().execute()
        return result.data

    # Verifica se stage pertence ao pipeline
    stage = db.table("stages").select("id").eq(
        "id", new_stage_id
    ).eq("pipeline_id", deal.data["pipeline_id"]).single().execute()

    if not stage.data:
        raise HTTPException(status_code=400, detail="Stage não pertence ao pipeline")

    # Atualiza deal
    result = db.table("deals").update(
        {"stage_id": new_stage_id}
    ).eq("id", str(deal_id)).execute()

    # Cria activity de mudança de stage
    db.table("deal_activities").insert({
        "owner_id": str(owner_id),
        "deal_id": str(deal_id),
        "activity_type": "stage_change",
        "from_stage_id": old_stage_id,
        "to_stage_id": new_stage_id,
    }).execute()

    return result.data[0]


@router.post("/{deal_id}/win", response_model=Deal)
async def win_deal(
    deal_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Marca deal como ganho."""
    result = db.table("deals").update(
        {"won_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", str(deal_id)).eq("owner_id", str(owner_id)).is_(
        "won_at", "null"
    ).is_("lost_at", "null").execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado ou já fechado")

    # Cria activity
    db.table("deal_activities").insert({
        "owner_id": str(owner_id),
        "deal_id": str(deal_id),
        "activity_type": "note",
        "content": "Deal marcado como GANHO",
    }).execute()

    return result.data[0]


@router.post("/{deal_id}/lose", response_model=Deal)
async def lose_deal(
    deal_id: UUID,
    data: DealLoseRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Marca deal como perdido."""
    update_data = {"lost_at": datetime.now(timezone.utc).isoformat()}

    # Busca nome do motivo se reason_id informado
    reason_name = None
    if data.reason_id:
        reason_result = db.table("loss_reasons").select("name").eq(
            "id", str(data.reason_id)
        ).single().execute()
        if reason_result.data:
            reason_name = reason_result.data["name"]
            update_data["lost_reason_id"] = str(data.reason_id)
            update_data["lost_reason"] = reason_name
    elif data.reason:
        update_data["lost_reason"] = data.reason
        reason_name = data.reason

    if data.description:
        update_data["lost_description"] = data.description

    result = db.table("deals").update(update_data).eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).is_(
        "won_at", "null"
    ).is_("lost_at", "null").execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado ou já fechado")

    # Cria activity
    content = "Deal marcado como PERDIDO"
    if reason_name:
        content += f"\nMotivo: {reason_name}"
    if data.description:
        content += f"\n{data.description}"

    db.table("deal_activities").insert({
        "owner_id": str(owner_id),
        "deal_id": str(deal_id),
        "activity_type": "note",
        "content": content,
    }).execute()

    return result.data[0]


# ============================================
# Products
# ============================================
@router.get("/{deal_id}/products", response_model=list[DealProduct])
async def list_products(
    deal_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista produtos do deal."""
    result = db.table("deal_products").select("*").eq(
        "deal_id", str(deal_id)
    ).eq("owner_id", str(owner_id)).execute()

    return result.data


@router.post("/{deal_id}/products", response_model=DealProduct, status_code=201)
async def add_product(
    deal_id: UUID,
    data: DealProductCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Adiciona produto ao deal. Pode usar product_id do catálogo ou nome/valor manual."""
    # Verifica se deal existe
    deal = db.table("deals").select("id").eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not deal.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")

    payload = {
        "owner_id": str(owner_id),
        "deal_id": str(deal_id),
    }

    # Se product_id informado, busca do catálogo
    if data.product_id:
        product = db.table("products").select("*").eq(
            "id", str(data.product_id)
        ).eq("owner_id", str(owner_id)).single().execute()

        if not product.data:
            raise HTTPException(status_code=404, detail="Produto do catálogo não encontrado")

        payload["product_id"] = str(data.product_id)
        payload["name"] = product.data["name"]
        payload["value"] = product.data["value"]
    else:
        # Requer nome e valor manual
        if not data.name:
            raise HTTPException(status_code=400, detail="Nome do produto é obrigatório")

        payload["name"] = data.name
        payload["value"] = str(float(data.value)) if data.value else "0"

    result = db.table("deal_products").insert(payload).execute()
    return result.data[0]


@router.delete("/{deal_id}/products/{product_id}", status_code=204)
async def remove_product(
    deal_id: UUID,
    product_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Remove produto do deal."""
    result = db.table("deal_products").delete().eq(
        "id", str(product_id)
    ).eq("deal_id", str(deal_id)).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Produto não encontrado")


# ============================================
# Activities
# ============================================
@router.get("/{deal_id}/activities")
async def list_activities(
    deal_id: UUID,
    limit: int = Query(default=50, le=200),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista atividades do deal (timeline)."""
    result = db.table("deal_activities").select("*").eq(
        "deal_id", str(deal_id)
    ).eq("owner_id", str(owner_id)).order(
        "created_at", desc=True
    ).limit(limit).execute()

    activities = result.data or []

    # Enrich stage_change activities with stage info
    stage_ids = set()
    for act in activities:
        if act.get("from_stage_id"):
            stage_ids.add(act["from_stage_id"])
        if act.get("to_stage_id"):
            stage_ids.add(act["to_stage_id"])

    stages_map = {}
    if stage_ids:
        stages_result = db.table("stages").select(
            "id, name, color"
        ).in_("id", list(stage_ids)).execute()
        for s in stages_result.data or []:
            stages_map[s["id"]] = s

    # Add stage info to activities
    for act in activities:
        act["from_stage"] = stages_map.get(act.get("from_stage_id"))
        act["to_stage"] = stages_map.get(act.get("to_stage_id"))

    return activities


@router.post("/{deal_id}/activities", response_model=DealActivity, status_code=201)
async def create_activity(
    deal_id: UUID,
    data: DealActivityCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Cria nota ou tarefa no deal."""
    # Verifica se deal existe
    deal = db.table("deals").select("id").eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not deal.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")

    payload = data.model_dump(mode="json")
    payload["owner_id"] = str(owner_id)
    payload["deal_id"] = str(deal_id)

    result = db.table("deal_activities").insert(payload).execute()
    return result.data[0]


@router.patch("/{deal_id}/activities/{activity_id}", response_model=DealActivity)
async def update_activity(
    deal_id: UUID,
    activity_id: UUID,
    data: DealActivityUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Atualiza atividade (ex: completar task)."""
    payload = data.model_dump(exclude_unset=True, mode="json")

    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    result = db.table("deal_activities").update(payload).eq(
        "id", str(activity_id)
    ).eq("deal_id", str(deal_id)).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Atividade não encontrada")

    return result.data[0]


@router.delete("/{deal_id}/activities/{activity_id}", status_code=204)
async def delete_activity(
    deal_id: UUID,
    activity_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Remove atividade."""
    result = db.table("deal_activities").delete().eq(
        "id", str(activity_id)
    ).eq("deal_id", str(deal_id)).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Atividade não encontrada")


# ============================================
# Reopen (reverter ganho/perdido)
# ============================================
@router.post("/{deal_id}/reopen", response_model=Deal)
async def reopen_deal(
    deal_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Reabre deal fechado (reverte status de ganho ou perdido)."""
    # Verifica se deal existe e está fechado
    deal = db.table("deals").select("*").eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not deal.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")

    if not deal.data.get("won_at") and not deal.data.get("lost_at"):
        raise HTTPException(status_code=400, detail="Deal já está aberto")

    if deal.data.get("archived_at"):
        raise HTTPException(status_code=400, detail="Deal arquivado não pode ser reaberto")

    # Limpa status
    result = db.table("deals").update({
        "won_at": None,
        "lost_at": None,
        "lost_reason": None,
    }).eq("id", str(deal_id)).execute()

    # Cria activity
    db.table("deal_activities").insert({
        "owner_id": str(owner_id),
        "deal_id": str(deal_id),
        "activity_type": "note",
        "content": "Deal reaberto",
    }).execute()

    return result.data[0]


# ============================================
# Tags (adicionar/remover tags do deal)
# ============================================
@router.get("/{deal_id}/tags", response_model=list[DealTag])
async def list_deal_tags(
    deal_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista tags do deal."""
    # Verifica deal
    deal = db.table("deals").select("id").eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not deal.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")

    # Busca tags via join
    result = db.table("deal_tag_assignments").select(
        "tag_id, deal_tags(*)"
    ).eq("deal_id", str(deal_id)).execute()

    return [item["deal_tags"] for item in result.data if item.get("deal_tags")]


@router.post("/{deal_id}/tags/{tag_id}", status_code=201)
async def add_tag_to_deal(
    deal_id: UUID,
    tag_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Adiciona tag ao deal."""
    # Verifica deal
    deal = db.table("deals").select("id").eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not deal.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")

    # Verifica tag
    tag = db.table("deal_tags").select("id").eq(
        "id", str(tag_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not tag.data:
        raise HTTPException(status_code=404, detail="Tag não encontrada")

    # Adiciona relação (ignora se já existe)
    try:
        db.table("deal_tag_assignments").insert({
            "deal_id": str(deal_id),
            "tag_id": str(tag_id),
        }).execute()
    except Exception:
        pass  # Já existe

    return {"status": "ok"}


@router.delete("/{deal_id}/tags/{tag_id}", status_code=204)
async def remove_tag_from_deal(
    deal_id: UUID,
    tag_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Remove tag do deal."""
    # Verifica se deal pertence ao owner
    deal = db.table("deals").select("id").eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not deal.data:
        raise HTTPException(status_code=404, detail="Deal nao encontrado")

    # Remove associacao (deal_tag_assignments nao tem owner_id)
    db.table("deal_tag_assignments").delete().eq(
        "deal_id", str(deal_id)
    ).eq("tag_id", str(tag_id)).execute()


# ============================================
# Files (arquivos do deal)
# ============================================
@router.get("/{deal_id}/files", response_model=list[DealFile])
async def list_files(
    deal_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista arquivos do deal."""
    result = db.table("deal_files").select("*").eq(
        "deal_id", str(deal_id)
    ).eq("owner_id", str(owner_id)).order("created_at", desc=True).execute()

    return result.data


@router.post("/{deal_id}/files", response_model=DealFile, status_code=201)
async def add_file(
    deal_id: UUID,
    data: DealFileCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Adiciona arquivo ao deal."""
    # Verifica deal
    deal = db.table("deals").select("id").eq(
        "id", str(deal_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not deal.data:
        raise HTTPException(status_code=404, detail="Deal não encontrado")

    payload = data.model_dump(mode="json")
    payload["owner_id"] = str(owner_id)
    payload["deal_id"] = str(deal_id)

    result = db.table("deal_files").insert(payload).execute()
    return result.data[0]


@router.delete("/{deal_id}/files/{file_id}", status_code=204)
async def delete_file(
    deal_id: UUID,
    file_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Remove arquivo do deal."""
    result = db.table("deal_files").delete().eq(
        "id", str(file_id)
    ).eq("deal_id", str(deal_id)).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")


# ============================================
# Send Message (para automacoes CRM)
# ============================================
class DealSendMessageRequest(BaseModel):
    """Request para enviar mensagem a partir de um deal."""
    channel: Literal["email", "openphone_sms"]
    integration_account_id: UUID

    # Opcao 1: identity existente
    to_identity_id: UUID | None = None

    # Opcao 2: envio direto (sem identity previa)
    to_email: str | None = None       # Para email
    to_phone: str | None = None       # Para SMS (normalizado para E.164)

    subject: str | None = None  # Apenas para email
    body: str
    template_id: UUID | None = None

    @field_validator("to_phone", mode="before")
    @classmethod
    def normalize_phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        # Remover espacos, hifens, parenteses
        phone = re.sub(r"[\s\-\(\)]", "", v)
        # Adicionar + se nao tiver
        if not phone.startswith("+"):
            # Assumir EUA (+1) se nao tiver codigo de pais
            if phone.startswith("1") and len(phone) == 11:
                phone = "+" + phone
            else:
                phone = "+1" + phone

        # Validar formato US: +1XXXXXXXXXX = 11 digitos (1 + 10 digitos do numero)
        digits_only = re.sub(r"\D", "", phone)
        if len(digits_only) != 11 or not phone.startswith("+1"):
            raise ValueError("Telefone deve estar no formato US: +1XXXXXXXXXX (11 digitos)")

        return phone

    @field_validator("to_email", mode="before")
    @classmethod
    def normalize_email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.lower().strip()

    @model_validator(mode="after")
    def validate_channel_recipient(self) -> "DealSendMessageRequest":
        """Valida que o destinatario corresponde ao canal escolhido."""
        # Se tem identity_id, nao precisa validar
        if self.to_identity_id:
            return self

        if self.channel == "email" and self.to_phone and not self.to_email:
            raise ValueError("Canal email requer to_email, nao to_phone")

        if self.channel == "openphone_sms" and self.to_email and not self.to_phone:
            raise ValueError("Canal SMS requer to_phone, nao to_email")

        return self


@router.post("/{deal_id}/send-message", status_code=201)
async def send_message_from_deal(
    deal_id: UUID,
    data: DealSendMessageRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Envia mensagem a partir de um deal (para automacoes CRM).

    Suporta canais: email, openphone_sms
    Apos envio bem-sucedido, dispara trigger message_sent para automacoes.
    """
    # Buscar deal para obter contact_id e workspace_id
    deal_result = db.table("deals").select(
        "id, contact_id, title, value, pipeline_id, stage_id, pipelines(workspace_id)"
    ).eq("id", str(deal_id)).eq("owner_id", str(owner_id)).single().execute()

    if not deal_result.data:
        raise HTTPException(status_code=404, detail="Deal nao encontrado")

    deal = deal_result.data
    contact_id = deal.get("contact_id")
    workspace_id = deal.get("pipelines", {}).get("workspace_id") if deal.get("pipelines") else None

    # Determinar destinatario: identity existente OU envio direto
    to_address: str | None = None
    identity_id_for_conversation: str | None = None

    if data.to_identity_id:
        # Opcao 1: buscar identity existente
        identity_result = db.table("contact_identities").select(
            "id, type, value"
        ).eq("id", str(data.to_identity_id)).single().execute()

        if not identity_result.data:
            raise HTTPException(status_code=404, detail="Identity nao encontrada")

        identity = identity_result.data
        to_address = identity.get("value")
        identity_id_for_conversation = str(data.to_identity_id)

    elif data.to_email and data.channel == "email":
        # Opcao 2a: envio direto para email
        to_address = data.to_email

        # Criar identity orfa se nao existir
        existing = db.table("contact_identities").select("id").eq(
            "owner_id", str(owner_id)
        ).eq("type", "email").eq("value", to_address).execute()

        if existing.data:
            identity_id_for_conversation = existing.data[0]["id"]
        else:
            insert_data = {
                "owner_id": str(owner_id),
                "type": "email",
                "value": to_address,
            }
            if workspace_id:
                insert_data["workspace_id"] = str(workspace_id)
            new_identity = db.table("contact_identities").insert(insert_data).execute()
            if new_identity.data:
                identity_id_for_conversation = new_identity.data[0]["id"]

    elif data.to_phone and data.channel == "openphone_sms":
        # Opcao 2b: envio direto para telefone
        to_address = data.to_phone  # Ja normalizado pelo validator

        # Criar identity orfa se nao existir
        existing = db.table("contact_identities").select("id").eq(
            "owner_id", str(owner_id)
        ).eq("type", "phone").eq("value", to_address).execute()

        if existing.data:
            identity_id_for_conversation = existing.data[0]["id"]
        else:
            insert_data = {
                "owner_id": str(owner_id),
                "type": "phone",
                "value": to_address,
            }
            if workspace_id:
                insert_data["workspace_id"] = str(workspace_id)
            new_identity = db.table("contact_identities").insert(insert_data).execute()
            if new_identity.data:
                identity_id_for_conversation = new_identity.data[0]["id"]

    else:
        raise HTTPException(
            status_code=400,
            detail="Informe to_identity_id, to_email ou to_phone"
        )

    # Buscar integration_account para validar
    int_account_result = db.table("integration_accounts").select(
        "id, type, is_active, credentials_encrypted"
    ).eq("id", str(data.integration_account_id)).eq(
        "owner_id", str(owner_id)
    ).eq("is_active", True).single().execute()

    if not int_account_result.data:
        raise HTTPException(
            status_code=404,
            detail="Integration account nao encontrada ou inativa"
        )

    n8n_api_key = os.environ.get("N8N_API_KEY", "")
    message_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # ============================================
    # EMAIL
    # ============================================
    if data.channel == "email":
        n8n_webhook_url = os.environ.get(
            "N8N_WEBHOOK_EMAIL_SEND",
            "https://n8nwebhook.thereconquestmap.com/webhook/email/send"
        )

        # Buscar conversation existente ou None
        conversation_id = None
        if identity_id_for_conversation:
            conv_result = db.table("conversations").select("id").eq(
                "owner_id", str(owner_id)
            ).eq("primary_identity_id", identity_id_for_conversation).limit(1).execute()
            conversation_id = conv_result.data[0]["id"] if conv_result.data else None

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    n8n_webhook_url,
                    headers={
                        "X-API-KEY": n8n_api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "id": message_id,
                        "conversation_id": conversation_id,
                        "integration_account_id": str(data.integration_account_id),
                        "to": to_address,
                        "subject": data.subject or f"Re: {deal.get('title', 'Deal')}",
                        "text": data.body,
                        "attachments": [],
                    },
                )

            if response.status_code == 200:
                resp_data = response.json()
                if resp_data.get("status") == "ok":
                    # Dispara trigger message_sent
                    executor = AutomationExecutor(db=db, owner_id=str(owner_id))
                    await executor.dispatch_trigger(
                        trigger_type=AutomationTriggerType.message_sent,
                        deal_id=deal_id,
                        trigger_data={
                            "channel": "email",
                            "integration_account_id": str(data.integration_account_id),
                            "contact_id": contact_id,
                            "message_id": message_id,
                        },
                    )

                    return {
                        "id": message_id,
                        "deal_id": str(deal_id),
                        "channel": "email",
                        "to": to_address,
                        "sent_at": now,
                        "status": "sent",
                    }
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=resp_data.get("error", "Erro ao enviar email")
                    )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Erro n8n: {response.status_code}"
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # ============================================
    # OPENPHONE SMS
    # ============================================
    if data.channel == "openphone_sms":
        n8n_webhook_url = os.environ.get(
            "N8N_WEBHOOK_OPENPHONE_SEND",
            "https://n8nwebhook.thereconquestmap.com/webhook/openphone/send"
        )

        # Buscar conversation existente ou None
        conversation_id = None
        if identity_id_for_conversation:
            conv_result = db.table("conversations").select("id").eq(
                "owner_id", str(owner_id)
            ).eq("primary_identity_id", identity_id_for_conversation).limit(1).execute()
            conversation_id = conv_result.data[0]["id"] if conv_result.data else None

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    n8n_webhook_url,
                    headers={
                        "X-API-KEY": n8n_api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "id": message_id,
                        "conversation_id": conversation_id,
                        "integration_account_id": str(data.integration_account_id),
                        "to": to_address,
                        "text": data.body,
                    },
                )

            if response.status_code == 200:
                resp_data = response.json()
                if resp_data.get("status") == "ok":
                    # Dispara trigger message_sent
                    executor = AutomationExecutor(db=db, owner_id=str(owner_id))
                    await executor.dispatch_trigger(
                        trigger_type=AutomationTriggerType.message_sent,
                        deal_id=deal_id,
                        trigger_data={
                            "channel": "openphone_sms",
                            "integration_account_id": str(data.integration_account_id),
                            "contact_id": contact_id,
                            "message_id": message_id,
                        },
                    )

                    return {
                        "id": message_id,
                        "deal_id": str(deal_id),
                        "channel": "openphone_sms",
                        "to": to_address,
                        "sent_at": now,
                        "status": "sent",
                    }
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=resp_data.get("error", "Erro ao enviar SMS")
                    )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Erro n8n: {response.status_code}"
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

