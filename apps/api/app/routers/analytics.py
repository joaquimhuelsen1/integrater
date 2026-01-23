"""
Router Analytics - Dashboard cross-workspace.

OTIMIZAÇÃO: Cache TTL para reduzir queries ao banco.
"""
from fastapi import APIRouter, Depends, Query
from supabase import Client
from uuid import UUID
from typing import Optional
from datetime import date

from app.deps import get_supabase, get_current_user_id
from app.models.workspace import AnalyticsSummary, WorkspaceSummary
from app.services.cache import get_cached, set_cached, TTL_SHORT, TTL_MEDIUM

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummary)
async def get_summary(
    workspace_ids: Optional[str] = Query(None, description="UUIDs separados por vírgula"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna resumo geral de todos ou alguns workspaces.
    Se workspace_ids vazio/null, retorna todos do owner.

    OTIMIZAÇÃO: Cache de 30s (endpoint muito pesado - múltiplos loops).
    """
    # Cache key
    cache_key = f"analytics_summary:{owner_id}:{workspace_ids}:{date_from}:{date_to}"
    cached_result, hit = get_cached(cache_key)
    if hit:
        if isinstance(cached_result, dict):
            return AnalyticsSummary(**cached_result)
        return cached_result

    # Busca workspaces do owner
    ws_query = db.table("workspaces").select("id, name, color").eq(
        "owner_id", str(owner_id)
    )

    # Filtra por IDs se fornecido
    if workspace_ids:
        ids_list = [id.strip() for id in workspace_ids.split(",")]
        ws_query = ws_query.in_("id", ids_list)

    workspaces_result = ws_query.execute()
    workspaces = workspaces_result.data or []

    workspace_summaries = []
    totals = {
        "deals_count": 0,
        "deals_value": 0,
        "deals_won_count": 0,
        "deals_won_value": 0,
        "conversations_count": 0,
        "unread_count": 0,
    }

    for ws in workspaces:
        ws_id = ws["id"]

        # Deals
        deals_query = db.table("deals").select(
            "id, value, won_at"
        ).eq("owner_id", str(owner_id))

        # Filtra deals por pipeline que pertence ao workspace
        pipelines = db.table("pipelines").select("id").eq(
            "workspace_id", ws_id
        ).execute()
        pipeline_ids = [p["id"] for p in (pipelines.data or [])]

        if pipeline_ids:
            stages = db.table("stages").select("id").in_(
                "pipeline_id", pipeline_ids
            ).execute()
            stage_ids = [s["id"] for s in (stages.data or [])]

            if stage_ids:
                deals_query = deals_query.in_("stage_id", stage_ids)

                # Aplica filtro de data se fornecido
                if date_from:
                    deals_query = deals_query.gte("created_at", str(date_from))
                if date_to:
                    deals_query = deals_query.lte("created_at", str(date_to))

                deals_result = deals_query.execute()
                deals = deals_result.data or []
            else:
                deals = []
        else:
            deals = []

        deals_count = len(deals)
        deals_value = sum(d.get("value", 0) or 0 for d in deals)
        deals_won = [d for d in deals if d.get("won_at")]
        deals_won_count = len(deals_won)
        deals_won_value = sum(d.get("value", 0) or 0 for d in deals_won)

        # Conversations
        conv_query = db.table("conversations").select(
            "id, unread_count"
        ).eq("workspace_id", ws_id)

        if date_from:
            conv_query = conv_query.gte("created_at", str(date_from))
        if date_to:
            conv_query = conv_query.lte("created_at", str(date_to))

        conv_result = conv_query.execute()
        conversations = conv_result.data or []

        conversations_count = len(conversations)
        unread_count = sum(c.get("unread_count", 0) or 0 for c in conversations)

        summary = WorkspaceSummary(
            id=ws_id,
            name=ws["name"],
            color=ws["color"],
            deals_count=deals_count,
            deals_value=deals_value,
            conversations_count=conversations_count,
            unread_count=unread_count,
        )
        workspace_summaries.append(summary)

        # Acumula totais
        totals["deals_count"] += deals_count
        totals["deals_value"] += deals_value
        totals["deals_won_count"] += deals_won_count
        totals["deals_won_value"] += deals_won_value
        totals["conversations_count"] += conversations_count
        totals["unread_count"] += unread_count

    response = AnalyticsSummary(
        workspaces=workspace_summaries,
        totals=totals,
    )
    # Cache como dict para serialização
    set_cached(cache_key, {
        "workspaces": [w.model_dump() for w in workspace_summaries],
        "totals": totals
    }, TTL_SHORT)
    return response


@router.get("/deals")
async def get_deals_analytics(
    workspace_ids: Optional[str] = Query(None),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna analytics detalhados de deals por workspace.

    OTIMIZAÇÃO: Cache de 60s (endpoint MUITO pesado - 4 níveis de loop).
    """
    # Cache key
    cache_key = f"analytics_deals:{owner_id}:{workspace_ids}:{date_from}:{date_to}"
    cached_result, hit = get_cached(cache_key)
    if hit:
        return cached_result

    # Busca workspaces
    ws_query = db.table("workspaces").select("id, name, color").eq(
        "owner_id", str(owner_id)
    )

    if workspace_ids:
        ids_list = [id.strip() for id in workspace_ids.split(",")]
        ws_query = ws_query.in_("id", ids_list)

    workspaces = ws_query.execute().data or []

    result = []
    for ws in workspaces:
        ws_id = ws["id"]

        # Busca pipelines do workspace
        pipelines = db.table("pipelines").select(
            "id, name"
        ).eq("workspace_id", ws_id).eq("is_archived", False).execute()

        pipeline_data = []
        for pipeline in (pipelines.data or []):
            # Busca stages e deals
            stages = db.table("stages").select(
                "id, name, color, is_win, is_loss"
            ).eq("pipeline_id", pipeline["id"]).order("position").execute()

            stage_data = []
            for stage in (stages.data or []):
                deals_query = db.table("deals").select(
                    "id, value, won_at, lost_at"
                ).eq("stage_id", stage["id"])

                if date_from:
                    deals_query = deals_query.gte("created_at", str(date_from))
                if date_to:
                    deals_query = deals_query.lte("created_at", str(date_to))

                deals = deals_query.execute().data or []

                stage_data.append({
                    "id": stage["id"],
                    "name": stage["name"],
                    "color": stage["color"],
                    "is_win": stage.get("is_win", False),
                    "is_loss": stage.get("is_loss", False),
                    "deals_count": len(deals),
                    "deals_value": sum(d.get("value", 0) or 0 for d in deals),
                })

            pipeline_data.append({
                "id": pipeline["id"],
                "name": pipeline["name"],
                "stages": stage_data,
            })

        result.append({
            "workspace_id": ws_id,
            "workspace_name": ws["name"],
            "workspace_color": ws["color"],
            "pipelines": pipeline_data,
        })

    set_cached(cache_key, result, TTL_MEDIUM)
    return result


@router.get("/conversations")
async def get_conversations_analytics(
    workspace_ids: Optional[str] = Query(None),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna analytics de conversas por workspace.

    OTIMIZAÇÃO: Cache de 60s.
    """
    # Cache key
    cache_key = f"analytics_convs:{owner_id}:{workspace_ids}:{date_from}:{date_to}"
    cached_result, hit = get_cached(cache_key)
    if hit:
        return cached_result

    ws_query = db.table("workspaces").select("id, name, color").eq(
        "owner_id", str(owner_id)
    )

    if workspace_ids:
        ids_list = [id.strip() for id in workspace_ids.split(",")]
        ws_query = ws_query.in_("id", ids_list)

    workspaces = ws_query.execute().data or []

    result = []
    for ws in workspaces:
        ws_id = ws["id"]

        # Busca integration_accounts do workspace
        accounts = db.table("integration_accounts").select(
            "id, account_type, account_name"
        ).eq("workspace_id", ws_id).execute()

        account_data = []
        for account in (accounts.data or []):
            conv_query = db.table("conversations").select(
                "id, unread_count"
            ).eq("integration_account_id", account["id"])

            if date_from:
                conv_query = conv_query.gte("created_at", str(date_from))
            if date_to:
                conv_query = conv_query.lte("created_at", str(date_to))

            conversations = conv_query.execute().data or []

            account_data.append({
                "id": account["id"],
                "type": account["account_type"],
                "name": account.get("account_name") or account["account_type"],
                "conversations_count": len(conversations),
                "unread_count": sum(c.get("unread_count", 0) or 0 for c in conversations),
            })

        result.append({
            "workspace_id": ws_id,
            "workspace_name": ws["name"],
            "workspace_color": ws["color"],
            "accounts": account_data,
            "total_conversations": sum(a["conversations_count"] for a in account_data),
            "total_unread": sum(a["unread_count"] for a in account_data),
        })

    set_cached(cache_key, result, TTL_MEDIUM)
    return result
