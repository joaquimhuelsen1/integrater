"""
Router Deals - CRUD de deals, produtos e atividades (CRM).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from typing import Optional

from app.deps import get_supabase, get_current_user_id
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
    DealActivityWithStages,
    DealFile,
    DealFileCreate,
    DealTag,
)
from app.models.enums import DealActivityType

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

    # Agrupa por stage
    deals_by_stage = {}
    for deal in deals_result.data or []:
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


@router.delete("/{deal_id}", status_code=204)
async def archive_deal(
    deal_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Arquiva deal."""
    result = db.table("deals").update(
        {"archived_at": datetime.utcnow().isoformat()}
    ).eq("id", str(deal_id)).eq("owner_id", str(owner_id)).execute()

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
        {"won_at": datetime.utcnow().isoformat()}
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
    update_data = {"lost_at": datetime.utcnow().isoformat()}

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
        payload["value"] = float(data.value) if data.value else 0

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

