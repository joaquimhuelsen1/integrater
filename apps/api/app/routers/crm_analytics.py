"""
Router CRM Analytics - Métricas e estatísticas do CRM.
"""
from fastapi import APIRouter, Depends, Query
from supabase import Client
from uuid import UUID
from decimal import Decimal
from datetime import datetime, timedelta
from typing import Optional

from app.deps import get_supabase, get_current_user_id
from app.models.crm import PipelineStats, StageStats, FunnelData

router = APIRouter(prefix="/crm", tags=["crm-analytics"])


@router.get("/stats")
async def get_crm_stats(
    pipeline_id: Optional[UUID] = None,
    days: int = Query(default=30, ge=1, le=365),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna estatísticas gerais do CRM."""
    date_from = datetime.utcnow() - timedelta(days=days)

    # Base query for deals
    query = db.table("deals").select("*").eq("owner_id", str(owner_id))

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
        if datetime.fromisoformat(d["created_at"].replace("Z", "+00:00")) >= date_from.replace(tzinfo=None)
    ]
    new_deals_count = len(deals_in_period)

    # Won in period
    won_in_period = [
        d for d in won_deals
        if d.get("won_at") and datetime.fromisoformat(d["won_at"].replace("Z", "+00:00")) >= date_from.replace(tzinfo=None)
    ]
    won_in_period_count = len(won_in_period)
    won_in_period_value = sum(Decimal(str(d["value"])) for d in won_in_period)

    return {
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


@router.get("/funnel/{pipeline_id}")
async def get_funnel_data(
    pipeline_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna dados do funil de vendas."""
    # Get stages
    stages_result = db.table("stages").select("*").eq(
        "pipeline_id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).order("position").execute()

    stages = stages_result.data or []

    # Get deals (não arquivados, não fechados)
    deals_result = db.table("deals").select("*").eq(
        "pipeline_id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).is_(
        "archived_at", "null"
    ).is_("won_at", "null").is_("lost_at", "null").execute()

    deals = deals_result.data or []

    # Group by stage
    deals_by_stage = {}
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

    return {"stages": funnel}


@router.get("/performance/{pipeline_id}")
async def get_performance_data(
    pipeline_id: UUID,
    days: int = Query(default=30, ge=1, le=365),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna dados de performance ao longo do tempo."""
    date_from = datetime.utcnow() - timedelta(days=days)

    # Get all deals from pipeline
    result = db.table("deals").select("*").eq(
        "pipeline_id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).is_("archived_at", "null").execute()

    deals = result.data or []

    # Group by date (created, won, lost)
    daily_data = {}

    for deal in deals:
        # Created
        created_date = datetime.fromisoformat(
            deal["created_at"].replace("Z", "+00:00")
        ).date().isoformat()

        if created_date not in daily_data:
            daily_data[created_date] = {"created": 0, "won": 0, "lost": 0, "won_value": 0}
        daily_data[created_date]["created"] += 1

        # Won
        if deal.get("won_at"):
            won_date = datetime.fromisoformat(
                deal["won_at"].replace("Z", "+00:00")
            ).date().isoformat()
            if won_date not in daily_data:
                daily_data[won_date] = {"created": 0, "won": 0, "lost": 0, "won_value": 0}
            daily_data[won_date]["won"] += 1
            daily_data[won_date]["won_value"] += float(deal["value"])

        # Lost
        if deal.get("lost_at"):
            lost_date = datetime.fromisoformat(
                deal["lost_at"].replace("Z", "+00:00")
            ).date().isoformat()
            if lost_date not in daily_data:
                daily_data[lost_date] = {"created": 0, "won": 0, "lost": 0, "won_value": 0}
            daily_data[lost_date]["lost"] += 1

    # Convert to sorted list
    sorted_dates = sorted(daily_data.keys())
    performance = [
        {"date": date, **daily_data[date]}
        for date in sorted_dates
        if datetime.fromisoformat(date) >= date_from.date()
    ]

    return {"performance": performance}


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
    today = datetime.utcnow().date().isoformat()

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
