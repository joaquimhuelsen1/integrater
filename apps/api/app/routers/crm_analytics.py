"""
Router CRM Analytics - Métricas e estatísticas do CRM.

OTIMIZAÇÃO: Endpoints com cache TTL para reduzir queries ao banco.
Stats de CRM não precisam ser real-time - 30-60s de cache é aceitável.
"""
import logging
from fastapi import APIRouter, Depends, Query
from supabase import Client
from uuid import UUID
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.deps import get_supabase, get_current_user_id
from app.services.cache import get_cached, set_cached, TTL_SHORT, TTL_MEDIUM

from app.models.crm import PipelineStats, StageStats, FunnelData, StageConversionResponse, StageConversionItem

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/crm", tags=["crm-analytics"])


@router.get("/stats")
async def get_crm_stats(
    pipeline_id: Optional[UUID] = None,
    days: int = Query(default=30, ge=1, le=365),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna estatísticas gerais do CRM.

    OTIMIZAÇÃO: Cache de 30s + SELECT apenas colunas necessárias.
    """
    # Cache key baseada nos parâmetros
    cache_key = f"crm_stats:{owner_id}:{pipeline_id}:{days}"
    cached_result, hit = get_cached(cache_key)
    if hit:
        return cached_result

    date_from = datetime.now(timezone.utc) - timedelta(days=days)
    date_from_str = date_from.isoformat()

    # OTIMIZAÇÃO: SELECT apenas colunas necessárias (não SELECT *)
    query = db.table("deals").select(
        "value, won_at, lost_at, probability, created_at"
    ).eq("owner_id", str(owner_id))

    if pipeline_id:
        query = query.eq("pipeline_id", str(pipeline_id))

    result = query.is_("archived_at", "null").execute()
    deals = result.data or []

    # Calculate stats
    total_deals = len(deals)
    total_value = sum(Decimal(str(d["value"])) for d in deals)

    # Won deals
    won_deals = [d for d in deals if d.get("won_at")]
    won_count = len(won_deals)
    won_value = sum(Decimal(str(d["value"])) for d in won_deals)

    # Lost deals
    lost_deals = [d for d in deals if d.get("lost_at")]
    lost_count = len(lost_deals)

    # Open deals (not won or lost)
    open_deals = [d for d in deals if not d.get("won_at") and not d.get("lost_at")]
    open_count = len(open_deals)
    open_value = sum(Decimal(str(d["value"])) for d in open_deals)

    # Weighted pipeline value
    weighted_value = sum(
        Decimal(str(d["value"])) * Decimal(str(d.get("probability", 50))) / 100
        for d in open_deals
    )

    # Conversion rate
    closed_count = won_count + lost_count
    conversion_rate = (won_count / closed_count * 100) if closed_count > 0 else 0

    # Average deal value
    avg_deal_value = total_value / total_deals if total_deals > 0 else Decimal("0")

    # Deals created in period
    deals_in_period = [
        d for d in deals
        if datetime.fromisoformat(d["created_at"].replace("Z", "+00:00")) >= date_from
    ]
    new_deals_count = len(deals_in_period)

    # Won in period
    won_in_period = [
        d for d in won_deals
        if d.get("won_at") and datetime.fromisoformat(d["won_at"].replace("Z", "+00:00")) >= date_from
    ]
    won_in_period_count = len(won_in_period)
    won_in_period_value = sum(Decimal(str(d["value"])) for d in won_in_period)

    response = {
        "total_deals": total_deals,
        "total_value": float(total_value),
        "open_deals": open_count,
        "open_value": float(open_value),
        "weighted_value": float(weighted_value),
        "won_deals": won_count,
        "won_value": float(won_value),
        "lost_deals": lost_count,
        "conversion_rate": round(conversion_rate, 1),
        "avg_deal_value": float(avg_deal_value),
        "period_days": days,
        "new_deals_period": new_deals_count,
        "won_deals_period": won_in_period_count,
        "won_value_period": float(won_in_period_value),
    }

    # Cache por 30 segundos
    set_cached(cache_key, response, TTL_SHORT)
    return response


@router.get("/funnel/{pipeline_id}")
async def get_funnel_data(
    pipeline_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna dados do funil de vendas.

    OTIMIZAÇÃO: Cache de 30s + SELECT apenas colunas necessárias.
    """
    # Cache key
    cache_key = f"crm_funnel:{owner_id}:{pipeline_id}"
    cached_result, hit = get_cached(cache_key)
    if hit:
        return cached_result

    # Get stages - SELECT apenas colunas necessárias
    stages_result = db.table("stages").select(
        "id, name, color, position, is_win, is_loss"
    ).eq(
        "pipeline_id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).order("position").execute()

    stages = stages_result.data or []

    # Get deals - SELECT apenas colunas necessárias
    deals_result = db.table("deals").select(
        "stage_id, value"
    ).eq(
        "pipeline_id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).is_(
        "archived_at", "null"
    ).is_("won_at", "null").is_("lost_at", "null").execute()

    deals = deals_result.data or []

    # Group by stage
    deals_by_stage: dict[str, list] = {}
    for deal in deals:
        stage_id = deal["stage_id"]
        if stage_id not in deals_by_stage:
            deals_by_stage[stage_id] = []
        deals_by_stage[stage_id].append(deal)

    # Build funnel data
    funnel = []
    for stage in stages:
        stage_deals = deals_by_stage.get(stage["id"], [])
        stage_value = sum(Decimal(str(d["value"])) for d in stage_deals)

        funnel.append({
            "stage_id": stage["id"],
            "stage_name": stage["name"],
            "stage_color": stage["color"],
            "position": stage["position"],
            "is_win": stage.get("is_win", False),
            "is_loss": stage.get("is_loss", False),
            "deals_count": len(stage_deals),
            "total_value": float(stage_value),
        })

    response = {"stages": funnel}
    set_cached(cache_key, response, TTL_SHORT)
    return response


@router.get("/performance/{pipeline_id}")
async def get_performance_data(
    pipeline_id: UUID,
    days: int = Query(default=30, ge=1, le=365),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna dados de performance ao longo do tempo.

    OTIMIZAÇÃO: Cache de 60s + SELECT apenas colunas necessárias.
    """
    # Cache key
    cache_key = f"crm_performance:{owner_id}:{pipeline_id}:{days}"
    cached_result, hit = get_cached(cache_key)
    if hit:
        return cached_result

    date_from = datetime.now(timezone.utc) - timedelta(days=days)

    # OTIMIZAÇÃO: SELECT apenas colunas necessárias
    result = db.table("deals").select(
        "created_at, won_at, lost_at, value"
    ).eq(
        "pipeline_id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).is_("archived_at", "null").execute()

    deals = result.data or []

    # Group by date (created, won, lost)
    daily_data: dict[str, dict] = {}

    for deal in deals:
        # Created
        created_date = datetime.fromisoformat(
            deal["created_at"].replace("Z", "+00:00")
        ).date().isoformat()

        if created_date not in daily_data:
            daily_data[created_date] = {"created": 0, "won": 0, "lost": 0, "won_value": Decimal("0")}
        daily_data[created_date]["created"] += 1

        # Won
        if deal.get("won_at"):
            won_date = datetime.fromisoformat(
                deal["won_at"].replace("Z", "+00:00")
            ).date().isoformat()
            if won_date not in daily_data:
                daily_data[won_date] = {"created": 0, "won": 0, "lost": 0, "won_value": Decimal("0")}
            daily_data[won_date]["won"] += 1
            daily_data[won_date]["won_value"] += Decimal(str(deal["value"]))

        # Lost
        if deal.get("lost_at"):
            lost_date = datetime.fromisoformat(
                deal["lost_at"].replace("Z", "+00:00")
            ).date().isoformat()
            if lost_date not in daily_data:
                daily_data[lost_date] = {"created": 0, "won": 0, "lost": 0, "won_value": Decimal("0")}
            daily_data[lost_date]["lost"] += 1

    # Convert to sorted list
    sorted_dates = sorted(daily_data.keys())
    date_from_str = date_from.date().isoformat()
    performance = [
        {
            "date": date,
            "created": daily_data[date]["created"],
            "won": daily_data[date]["won"],
            "lost": daily_data[date]["lost"],
            "won_value": float(daily_data[date]["won_value"])
        }
        for date in sorted_dates
        if date >= date_from_str
    ]

    response = {"trend": performance}
    set_cached(cache_key, response, TTL_MEDIUM)
    return response


@router.get("/top-deals")
async def get_top_deals(
    pipeline_id: Optional[UUID] = None,
    limit: int = Query(default=5, ge=1, le=20),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna os maiores deals abertos."""
    query = db.table("deals").select(
        "id, title, value, probability, expected_close_date, stage:stages(name, color), contact:contacts(display_name)"
    ).eq("owner_id", str(owner_id)).is_(
        "archived_at", "null"
    ).is_("won_at", "null").is_("lost_at", "null")

    if pipeline_id:
        query = query.eq("pipeline_id", str(pipeline_id))

    result = query.order("value", desc=True).limit(limit).execute()

    return {"deals": result.data or []}


@router.get("/overdue-deals")
async def get_overdue_deals(
    pipeline_id: Optional[UUID] = None,
    limit: int = Query(default=10, ge=1, le=50),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna deals com data de fechamento vencida."""
    today = datetime.now(timezone.utc).date().isoformat()

    query = db.table("deals").select(
        "id, title, value, expected_close_date, stage:stages(name, color), contact:contacts(display_name)"
    ).eq("owner_id", str(owner_id)).is_(
        "archived_at", "null"
    ).is_("won_at", "null").is_("lost_at", "null").lt(
        "expected_close_date", today
    ).not_.is_("expected_close_date", "null")

    if pipeline_id:
        query = query.eq("pipeline_id", str(pipeline_id))

    result = query.order("expected_close_date").limit(limit).execute()

    return {"deals": result.data or []}


@router.get("/sales-cycle")
async def get_sales_cycle(
    pipeline_id: Optional[UUID] = None,
    days: int = Query(default=30, ge=1, le=365),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna métricas do ciclo de vendas (tempo médio entre criação e won)."""
    date_from = datetime.now(timezone.utc) - timedelta(days=days)

    # Buscar deals ganhos no período
    query = db.table("deals").select("created_at, won_at").eq(
        "owner_id", str(owner_id)
    ).not_.is_("won_at", "null")

    if pipeline_id:
        query = query.eq("pipeline_id", str(pipeline_id))

    result = query.execute()
    deals = result.data or []

    # Filtrar deals ganhos no período
    won_in_period = []
    for deal in deals:
        won_at = datetime.fromisoformat(deal["won_at"].replace("Z", "+00:00"))
        if won_at >= date_from:
            created_at = datetime.fromisoformat(deal["created_at"].replace("Z", "+00:00"))
            cycle_days = (won_at - created_at).days
            won_in_period.append(cycle_days)

    if not won_in_period:
        return {
            "avg_days": 0,
            "min_days": 0,
            "max_days": 0,
            "deals_count": 0,
            "period_days": days,
        }

    avg_days = sum(won_in_period) / len(won_in_period)

    return {
        "avg_days": round(avg_days, 1),
        "min_days": min(won_in_period),
        "max_days": max(won_in_period),
        "deals_count": len(won_in_period),
        "period_days": days,
    }


@router.get("/win-rate-by-stage/{pipeline_id}")
async def get_win_rate_by_stage(
    pipeline_id: UUID,
    days: int = Query(default=90, ge=1, le=365),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna win rate por stage (conversão entre stages).

    OTIMIZAÇÃO: Cache de 60s.
    """
    # Cache key
    cache_key = f"crm_winrate:{owner_id}:{pipeline_id}:{days}"
    cached_result, hit = get_cached(cache_key)
    if hit:
        return cached_result

    date_from = datetime.now(timezone.utc) - timedelta(days=days)

    # Buscar stages do pipeline
    stages_result = db.table("stages").select("id, name, position, color").eq(
        "pipeline_id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).order("position").execute()
    stages = stages_result.data or []

    if not stages:
        return {"stages": []}

    # Buscar atividades de mudança de stage no período
    activities_result = db.table("deal_activities").select(
        "deal_id, old_value, new_value, created_at"
    ).eq("owner_id", str(owner_id)).eq(
        "activity_type", "stage_change"
    ).gte("created_at", date_from.isoformat()).execute()

    activities = activities_result.data or []

    # Buscar deals para saber quais foram won/lost
    deals_result = db.table("deals").select(
        "id, won_at, lost_at"
    ).eq("pipeline_id", str(pipeline_id)).eq("owner_id", str(owner_id)).execute()

    deals = {d["id"]: d for d in (deals_result.data or [])}

    # Mapear stage_id -> dados
    stage_stats = {}
    for stage in stages:
        stage_stats[stage["id"]] = {
            "stage_id": stage["id"],
            "stage_name": stage["name"],
            "position": stage["position"],
            "color": stage["color"],
            "deals_entered": 0,
            "deals_to_won": 0,
            "deals_to_lost": 0,
            "win_rate": 0.0,
        }

    # Processar atividades
    for activity in activities:
        old_stage = activity.get("old_value")
        new_stage = activity.get("new_value")
        deal_id = activity["deal_id"]

        # Contar entrada em stage
        if new_stage and new_stage in stage_stats:
            stage_stats[new_stage]["deals_entered"] += 1

        # Verificar se deal foi won ou lost
        deal = deals.get(deal_id)
        if deal and old_stage and old_stage in stage_stats:
            if deal.get("won_at"):
                stage_stats[old_stage]["deals_to_won"] += 1
            elif deal.get("lost_at"):
                stage_stats[old_stage]["deals_to_lost"] += 1

    # Calcular win rate por stage
    result_stages = []
    for stage in stages:
        stats = stage_stats[stage["id"]]
        total_exits = stats["deals_to_won"] + stats["deals_to_lost"]
        if total_exits > 0:
            stats["win_rate"] = round(stats["deals_to_won"] / total_exits * 100, 1)
        result_stages.append(stats)

    response = {"stages": result_stages, "period_days": days}
    set_cached(cache_key, response, TTL_MEDIUM)
    return response


@router.get("/stage-conversion/{pipeline_id}", response_model=StageConversionResponse)
async def get_stage_conversion(
    pipeline_id: UUID,
    days: int = Query(default=90, ge=1, le=365),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna conversao CUMULATIVA entre stages.

    OTIMIZAÇÃO: Cache de 60s.
    """
    # Cache key
    cache_key = f"crm_stageconv:{owner_id}:{pipeline_id}:{days}"
    cached_result, hit = get_cached(cache_key)
    if hit:
        # Retorna como StageConversionResponse se no cache
        if isinstance(cached_result, dict):
            return StageConversionResponse(**cached_result)
        return cached_result

    # Busca stages ordenados por position
    stages_result = db.table("stages").select("id, name, position, color").eq(
        "pipeline_id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).order("position").execute()
    stages = stages_result.data or []

    if not stages:
        return StageConversionResponse(stages=[], period_days=days)

    # Busca TODOS os deals do pipeline (sem filtro de periodo)
    deals_result = db.table("deals").select("id, stage_id").eq(
        "pipeline_id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).is_("archived_at", "null").execute()
    deals = deals_result.data or []
    all_deal_ids = set(d["id"] for d in deals)

    # DEBUG LOG
    logger.info(f"[stage-conversion] Pipeline {pipeline_id}: {len(deals)} deals encontrados")

    # Buscar activities APENAS dos deals deste pipeline
    activities_result = db.table("deal_activities").select(
        "deal_id, from_stage_id, to_stage_id"
    ).eq("owner_id", str(owner_id)).eq(
        "activity_type", "stage_change"
    ).execute()
    # Filtrar apenas activities dos deals deste pipeline
    all_activities = activities_result.data or []
    activities = [a for a in all_activities if a["deal_id"] in all_deal_ids]

    logger.info(f"[stage-conversion] {len(all_activities)} activities totais, {len(activities)} do pipeline")

    # Mapear positions
    stage_positions = {s["id"]: s["position"] for s in stages}

    # Construir historico de stages por deal (evita duplicacao)
    deal_stage_history: dict[str, set[str]] = {}

    # 1. Incluir stage atual de cada deal
    for deal in deals:
        deal_id = deal["id"]
        if deal_id not in deal_stage_history:
            deal_stage_history[deal_id] = set()
        deal_stage_history[deal_id].add(deal["stage_id"])

    # 2. Incluir historico de activities (from_stage e to_stage)
    for activity in activities:
        deal_id = activity["deal_id"]
        # Skip activities de deals que não estão na lista de ativos
        if deal_id not in deal_stage_history:
            continue

        if activity.get("from_stage_id"):
            deal_stage_history[deal_id].add(activity["from_stage_id"])
        if activity.get("to_stage_id"):
            deal_stage_history[deal_id].add(activity["to_stage_id"])

    logger.info(f"[stage-conversion] Historico construido para {len(deal_stage_history)} deals")

    # Calcular stats por stage
    result_stages = []

    for stage in stages:
        stage_id = stage["id"]
        position = stage["position"]

        # Contar deals que PASSARAM por este stage (sem duplicacao)
        deals_entered = sum(
            1 for stages_passed in deal_stage_history.values()
            if stage_id in stages_passed
        )

        logger.info(f"[stage-conversion] Stage '{stage['name']}': deals_entered={deals_entered}")

        # Deals que SAÍRAM deste stage para stage com position MAIOR
        progressed_deal_ids = set(
            a["deal_id"] for a in activities
            if a.get("from_stage_id") == stage_id and
               stage_positions.get(a.get("to_stage_id"), -1) > position
        )
        deals_progressed = len(progressed_deal_ids)

        # Calcular conversion_rate
        conversion_rate = round(
            (deals_progressed / deals_entered * 100) if deals_entered > 0 else 0, 1
        )

        result_stages.append(StageConversionItem(
            stage_id=stage_id,
            stage_name=stage["name"],
            stage_position=position,
            stage_color=stage["color"],
            deals_entered=deals_entered,
            deals_progressed=deals_progressed,
            conversion_rate=conversion_rate
        ))

    # Log do resultado final
    logger.info(f"[stage-conversion] Retornando {len(result_stages)} stages")

    response = StageConversionResponse(stages=result_stages, period_days=days)
    # Cache como dict para serialização
    set_cached(cache_key, {"stages": [s.model_dump() for s in result_stages], "period_days": days}, TTL_MEDIUM)
    return response


@router.get("/loss-reasons-stats")
async def get_loss_reasons_stats(
    pipeline_id: Optional[UUID] = None,
    days: int = Query(default=90, ge=1, le=365),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna estatísticas de motivos de perda."""
    date_from = datetime.now(timezone.utc) - timedelta(days=days)

    # Buscar deals perdidos no período
    query = db.table("deals").select(
        "id, value, lost_at, loss_reason_id"
    ).eq("owner_id", str(owner_id)).not_.is_("lost_at", "null")

    if pipeline_id:
        query = query.eq("pipeline_id", str(pipeline_id))

    result = query.execute()
    deals = result.data or []

    # Filtrar por período
    lost_deals = []
    for deal in deals:
        lost_at = datetime.fromisoformat(deal["lost_at"].replace("Z", "+00:00"))
        if lost_at >= date_from:
            lost_deals.append(deal)

    if not lost_deals:
        return {"reasons": [], "total_lost": 0, "period_days": days}

    # Buscar motivos de perda
    reasons_result = db.table("loss_reasons").select("id, name").eq(
        "owner_id", str(owner_id)
    ).execute()
    reasons_map = {r["id"]: r["name"] for r in (reasons_result.data or [])}

    # Agrupar por reason
    reason_stats: dict[Optional[str], dict] = {}
    for deal in lost_deals:
        reason_id = deal.get("loss_reason_id")
        if reason_id not in reason_stats:
            reason_stats[reason_id] = {
                "reason_id": reason_id,
                "reason_name": reasons_map.get(reason_id, "Sem motivo") if reason_id else "Sem motivo",
                "count": 0,
                "total_value": Decimal("0"),
            }
        reason_stats[reason_id]["count"] += 1
        reason_stats[reason_id]["total_value"] += Decimal(str(deal["value"]))

    # Calcular percentuais
    total_lost = len(lost_deals)
    reasons_list = []
    for stats in reason_stats.values():
        stats["percentage"] = round(stats["count"] / total_lost * 100, 1)
        stats["total_value"] = float(stats["total_value"])
        reasons_list.append(stats)

    # Ordenar por count descrescente
    reasons_list.sort(key=lambda x: x["count"], reverse=True)

    return {"reasons": reasons_list, "total_lost": total_lost, "period_days": days}


@router.get("/channel-performance")
async def get_channel_performance(
    pipeline_id: Optional[UUID] = None,
    days: int = Query(default=30, ge=1, le=365),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna performance por canal de comunicação.

    OTIMIZAÇÃO: Cache de 60s (endpoint pesado - 4 queries).
    """
    # Cache key
    cache_key = f"crm_channel:{owner_id}:{pipeline_id}:{days}"
    cached_result, hit = get_cached(cache_key)
    if hit:
        return cached_result

    date_from = datetime.now(timezone.utc) - timedelta(days=days)

    # Buscar conversations por canal
    conversations_result = db.table("conversations").select(
        "id, last_channel, contact_id"
    ).eq("owner_id", str(owner_id)).execute()
    conversations = conversations_result.data or []

    # Mapear conversation -> channel
    conv_channel_map = {c["id"]: c["last_channel"] for c in conversations}
    conv_contact_map = {c["id"]: c["contact_id"] for c in conversations}

    # Buscar mensagens no período
    messages_result = db.table("messages").select(
        "conversation_id, created_at"
    ).eq("owner_id", str(owner_id)).gte(
        "created_at", date_from.isoformat()
    ).execute()
    messages = messages_result.data or []

    # Buscar deals para calcular won_value por canal
    deals_query = db.table("deals").select(
        "id, contact_id, value, won_at"
    ).eq("owner_id", str(owner_id)).not_.is_("won_at", "null")

    if pipeline_id:
        deals_query = deals_query.eq("pipeline_id", str(pipeline_id))

    deals_result = deals_query.execute()
    deals = deals_result.data or []

    # Mapear contact -> deals ganhos no período
    contact_won_value: dict[str, Decimal] = {}
    for deal in deals:
        won_at = datetime.fromisoformat(deal["won_at"].replace("Z", "+00:00"))
        if won_at >= date_from:
            contact_id = deal.get("contact_id")
            if contact_id:
                if contact_id not in contact_won_value:
                    contact_won_value[contact_id] = Decimal("0")
                contact_won_value[contact_id] += Decimal(str(deal["value"]))

    # Agregar por canal
    channel_stats: dict[str, dict] = {}
    contacts_by_channel: dict[str, set] = {}

    for msg in messages:
        conv_id = msg["conversation_id"]
        channel = conv_channel_map.get(conv_id, "unknown")
        contact_id = conv_contact_map.get(conv_id)

        if channel not in channel_stats:
            channel_stats[channel] = {
                "channel": channel,
                "messages_count": 0,
                "deals_touched": 0,
                "won_value": Decimal("0"),
            }
            contacts_by_channel[channel] = set()

        channel_stats[channel]["messages_count"] += 1

        if contact_id:
            contacts_by_channel[channel].add(contact_id)

    # Calcular deals_touched e won_value por canal
    for channel, contacts in contacts_by_channel.items():
        channel_stats[channel]["deals_touched"] = len(contacts)
        for contact_id in contacts:
            if contact_id in contact_won_value:
                channel_stats[channel]["won_value"] += contact_won_value[contact_id]

    # Converter Decimal para float
    channels_list = []
    for stats in channel_stats.values():
        stats["won_value"] = float(stats["won_value"])
        channels_list.append(stats)

    # Ordenar por messages_count
    channels_list.sort(key=lambda x: x["messages_count"], reverse=True)

    response = {"channels": channels_list, "period_days": days}
    set_cached(cache_key, response, TTL_MEDIUM)
    return response


@router.get("/comparison")
async def get_comparison(
    pipeline_id: Optional[UUID] = None,
    days: int = Query(default=30, ge=1, le=365),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna comparativo entre período atual e anterior.

    OTIMIZAÇÃO: Cache de 60s.
    """
    # Cache key
    cache_key = f"crm_comparison:{owner_id}:{pipeline_id}:{days}"
    cached_result, hit = get_cached(cache_key)
    if hit:
        return cached_result

    now = datetime.now(timezone.utc)
    current_start = now - timedelta(days=days)
    previous_start = current_start - timedelta(days=days)

    # Buscar todos os deals
    query = db.table("deals").select(
        "id, value, created_at, won_at, lost_at"
    ).eq("owner_id", str(owner_id))

    if pipeline_id:
        query = query.eq("pipeline_id", str(pipeline_id))

    result = query.execute()
    deals = result.data or []

    # Separar por período
    current_period = {
        "new_deals": 0,
        "won_deals": 0,
        "lost_deals": 0,
        "won_value": Decimal("0"),
    }
    previous_period = {
        "new_deals": 0,
        "won_deals": 0,
        "lost_deals": 0,
        "won_value": Decimal("0"),
    }

    for deal in deals:
        created_at = datetime.fromisoformat(deal["created_at"].replace("Z", "+00:00"))
        value = Decimal(str(deal["value"]))

        # Novos deals
        if created_at >= current_start:
            current_period["new_deals"] += 1
        elif created_at >= previous_start:
            previous_period["new_deals"] += 1

        # Won deals
        if deal.get("won_at"):
            won_at = datetime.fromisoformat(deal["won_at"].replace("Z", "+00:00"))
            if won_at >= current_start:
                current_period["won_deals"] += 1
                current_period["won_value"] += value
            elif won_at >= previous_start:
                previous_period["won_deals"] += 1
                previous_period["won_value"] += value

        # Lost deals
        if deal.get("lost_at"):
            lost_at = datetime.fromisoformat(deal["lost_at"].replace("Z", "+00:00"))
            if lost_at >= current_start:
                current_period["lost_deals"] += 1
            elif lost_at >= previous_start:
                previous_period["lost_deals"] += 1

    # Calcular variacoes percentuais
    def calc_variation(current: float, previous: float) -> float:
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return round((current - previous) / previous * 100, 1)

    variations = {
        "new_deals_pct": calc_variation(current_period["new_deals"], previous_period["new_deals"]),
        "won_deals_pct": calc_variation(current_period["won_deals"], previous_period["won_deals"]),
        "lost_deals_pct": calc_variation(current_period["lost_deals"], previous_period["lost_deals"]),
        "won_value_pct": calc_variation(float(current_period["won_value"]), float(previous_period["won_value"])),
    }

    response = {
        "current_period": {
            "new_deals": current_period["new_deals"],
            "won_deals": current_period["won_deals"],
            "lost_deals": current_period["lost_deals"],
            "won_value": float(current_period["won_value"]),
        },
        "previous_period": {
            "new_deals": previous_period["new_deals"],
            "won_deals": previous_period["won_deals"],
            "lost_deals": previous_period["lost_deals"],
            "won_value": float(previous_period["won_value"]),
        },
        "variations": variations,
        "period_days": days,
    }
    set_cached(cache_key, response, TTL_MEDIUM)
    return response
