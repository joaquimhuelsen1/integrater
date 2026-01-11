from fastapi import APIRouter, Depends, Query
from supabase import Client
from postgrest.types import CountMethod
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel

from app.deps import get_supabase, get_current_user_id


# =============================================
# MODELS
# =============================================

class ContactBrief(BaseModel):
    id: str
    display_name: str | None = None
    email: str | None = None


class Purchase(BaseModel):
    id: str
    owner_id: str
    workspace_id: str
    contact_id: str | None = None
    email: str
    product_name: str
    product_id: str | None = None
    order_id: str | None = None
    amount: Decimal
    currency: str
    source: str
    source_data: dict = {}
    status: str
    purchased_at: datetime
    created_at: datetime
    updated_at: datetime
    contact: ContactBrief | None = None


class PurchaseList(BaseModel):
    items: list[Purchase]
    total: int
    has_more: bool = False


class SourceStats(BaseModel):
    source: str
    count: int
    total_amount: Decimal


class StatusStats(BaseModel):
    status: str
    count: int


class PurchaseStats(BaseModel):
    total_purchases: int
    total_amount: Decimal
    by_source: list[SourceStats]
    by_status: list[StatusStats]


router = APIRouter(prefix="/purchases", tags=["purchases"])


# =============================================
# ENDPOINTS
# =============================================

@router.get("", response_model=PurchaseList)
async def list_purchases(
    workspace_id: UUID = Query(..., description="ID do workspace"),
    search: str | None = Query(None, description="Busca por email ou produto"),
    source: str | None = Query(None, description="Filtrar por fonte (digistore24, hotmart, etc)"),
    date_from: datetime | None = Query(None, description="Data inicial"),
    date_to: datetime | None = Query(None, description="Data final"),
    skip: int = Query(default=0, ge=0, description="Offset para paginacao"),
    limit: int = Query(default=50, le=100),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Lista compras do workspace com filtros e paginacao.
    Retorna dados do contato vinculado se existir.
    Usa paginacao por offset (skip/limit).
    """
    # Base query para contagem e busca
    def apply_filters(q):
        q = q.eq("owner_id", str(owner_id)).eq("workspace_id", str(workspace_id))
        if search:
            q = q.or_(f"email.ilike.%{search}%,product_name.ilike.%{search}%")
        if source:
            q = q.eq("source", source)
        if date_from:
            q = q.gte("purchased_at", date_from.isoformat())
        if date_to:
            q = q.lte("purchased_at", date_to.isoformat())
        return q

    # Query de contagem total (com filtros, sem paginacao)
    count_query = db.table("purchases").select("id", count=CountMethod.exact)
    count_query = apply_filters(count_query)
    count_result = count_query.execute()
    total = count_result.count if count_result.count is not None else 0

    # Query de dados com paginacao
    data_query = db.table("purchases").select(
        "*, contact:contacts(id, display_name, email)"
    )
    data_query = apply_filters(data_query)
    result = data_query.order("purchased_at", desc=True).range(skip, skip + limit - 1).execute()

    items = result.data or []
    has_more = (skip + len(items)) < total

    # Formatar resposta
    purchases = []
    for item in items:
        contact_data = item.pop("contact", None)
        purchase = Purchase(
            **item,
            contact=ContactBrief(**contact_data) if contact_data else None
        )
        purchases.append(purchase)

    return PurchaseList(items=purchases, total=total, has_more=has_more)


@router.get("/stats", response_model=PurchaseStats)
async def get_purchase_stats(
    workspace_id: UUID = Query(..., description="ID do workspace"),
    date_from: datetime | None = Query(None, description="Data inicial"),
    date_to: datetime | None = Query(None, description="Data final"),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna estatisticas agregadas de compras.
    """
    query = db.table("purchases").select("*").eq(
        "owner_id", str(owner_id)
    ).eq(
        "workspace_id", str(workspace_id)
    )

    if date_from:
        query = query.gte("purchased_at", date_from.isoformat())

    if date_to:
        query = query.lte("purchased_at", date_to.isoformat())

    result = query.execute()
    purchases = result.data or []

    # Calcular totais
    total_purchases = len(purchases)
    total_amount = sum((Decimal(str(p.get("amount", 0))) for p in purchases), Decimal("0"))

    # Agrupar por source
    source_map: dict[str, dict] = {}
    for p in purchases:
        src = p.get("source", "unknown")
        if src not in source_map:
            source_map[src] = {"count": 0, "total_amount": Decimal("0")}
        source_map[src]["count"] += 1
        source_map[src]["total_amount"] += Decimal(str(p.get("amount", 0)))

    by_source = [
        SourceStats(source=src, count=data["count"], total_amount=data["total_amount"])
        for src, data in source_map.items()
    ]

    # Agrupar por status
    status_map: dict[str, int] = {}
    for p in purchases:
        status = p.get("status", "unknown")
        status_map[status] = status_map.get(status, 0) + 1

    by_status = [
        StatusStats(status=status, count=count)
        for status, count in status_map.items()
    ]

    return PurchaseStats(
        total_purchases=total_purchases,
        total_amount=total_amount,
        by_source=by_source,
        by_status=by_status,
    )
