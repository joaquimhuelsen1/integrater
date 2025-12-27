"""
Router Products - Catálogo de produtos.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from uuid import UUID
from typing import Optional

from app.deps import get_supabase, get_current_user_id
from app.models.crm import Product, ProductCreate, ProductUpdate

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[Product])
async def list_products(
    category: Optional[str] = None,
    search: Optional[str] = None,
    include_inactive: bool = False,
    limit: int = Query(default=100, le=500),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista produtos do catálogo."""
    query = db.table("products").select("*").eq("owner_id", str(owner_id))

    if not include_inactive:
        query = query.eq("is_active", True)

    if category:
        query = query.eq("category", category)

    if search:
        query = query.ilike("name", f"%{search}%")

    result = query.order("name").limit(limit).execute()
    return result.data


@router.get("/categories")
async def list_categories(
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista categorias únicas de produtos."""
    result = db.table("products").select("category").eq(
        "owner_id", str(owner_id)
    ).eq("is_active", True).not_.is_("category", "null").execute()

    categories = list(set(p["category"] for p in result.data if p.get("category")))
    categories.sort()
    return {"categories": categories}


@router.post("", response_model=Product, status_code=201)
async def create_product(
    data: ProductCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Cria novo produto no catálogo."""
    payload = data.model_dump(mode="json")
    payload["owner_id"] = str(owner_id)

    result = db.table("products").insert(payload).execute()
    return result.data[0]


@router.get("/{product_id}", response_model=Product)
async def get_product(
    product_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna produto do catálogo."""
    result = db.table("products").select("*").eq(
        "id", str(product_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    return result.data


@router.patch("/{product_id}", response_model=Product)
async def update_product(
    product_id: UUID,
    data: ProductUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Atualiza produto do catálogo."""
    payload = data.model_dump(exclude_unset=True, mode="json")

    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    result = db.table("products").update(payload).eq(
        "id", str(product_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    return result.data[0]


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Desativa produto (soft delete)."""
    result = db.table("products").update({"is_active": False}).eq(
        "id", str(product_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
