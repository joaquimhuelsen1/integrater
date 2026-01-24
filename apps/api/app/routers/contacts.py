from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from uuid import UUID
from datetime import datetime, timezone
from pydantic import BaseModel

from app.deps import get_supabase, get_current_user_id
from app.models import (
    Contact,
    ContactCreate,
    ContactUpdate,
    ContactWithIdentities,
    LinkIdentityRequest,
    UnlinkIdentityRequest,
    LinkByEmailRequest,
    LinkByEmailResponse,
)
from app.services.contact_service import get_contact_service
from app.services.cache import get_cached, set_cached, invalidate_cache, TTL_REALTIME


class ContactHistoryResponse(BaseModel):
    contact: dict
    purchases: list[dict] = []
    deals: list[dict] = []
    conversations: list[dict] = []
    stats: dict = {}

router = APIRouter(prefix="/contacts", tags=["contacts"])

# Colunas para SELECT específico (evita metadata grande)
CONTACT_LIST_COLUMNS = "id, owner_id, workspace_id, display_name, lead_stage, created_at, updated_at"


@router.get("", response_model=list[Contact])
async def list_contacts(
    workspace_id: UUID = Query(..., description="ID do workspace"),
    search: str | None = None,
    cursor: UUID | None = None,
    limit: int = Query(default=50, le=100),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    # Cache key (5s TTL para não afetar UX)
    cache_key = f"contacts:{owner_id}:{workspace_id}:{search}:{cursor}:{limit}"
    cached, hit = get_cached(cache_key)
    if hit:
        return cached

    # SELECT específico (evita metadata grande)
    query = db.table("contacts").select(CONTACT_LIST_COLUMNS).eq(
        "owner_id", str(owner_id)
    ).eq("workspace_id", str(workspace_id)).is_("deleted_at", "null")

    if search:
        query = query.ilike("display_name", f"%{search}%")

    if cursor:
        query = query.lt("id", str(cursor))

    result = query.order("created_at", desc=True).limit(limit).execute()

    # Cache resultado por 5 segundos
    set_cached(cache_key, result.data, TTL_REALTIME)
    return result.data


@router.post("", response_model=Contact, status_code=201)
async def create_contact(
    data: ContactCreate,
    workspace_id: UUID = Query(..., description="ID do workspace"),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    payload = data.model_dump()
    payload["owner_id"] = str(owner_id)
    payload["workspace_id"] = str(workspace_id)
    result = db.table("contacts").insert(payload).execute()

    # Invalida cache de contatos deste usuário/workspace
    invalidate_cache(f"contacts:{owner_id}:{workspace_id}")
    return result.data[0]


@router.get("/{contact_id}", response_model=ContactWithIdentities)
async def get_contact(
    contact_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    result = db.table("contacts").select(
        "*, identities:contact_identities(*)"
    ).eq("id", str(contact_id)).eq("owner_id", str(owner_id)).is_("deleted_at", "null").single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Contato não encontrado")

    return result.data


@router.patch("/{contact_id}", response_model=Contact)
async def update_contact(
    contact_id: UUID,
    data: ContactUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    payload = data.model_dump(exclude_unset=True)
    result = db.table("contacts").update(payload).eq(
        "id", str(contact_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Contato não encontrado")

    # Invalida cache de contatos deste usuário
    invalidate_cache(f"contacts:{owner_id}")
    return result.data[0]


@router.delete("/{contact_id}", status_code=204)
async def delete_contact(
    contact_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    result = db.table("contacts").update(
        {"deleted_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", str(contact_id)).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Contato não encontrado")

    # Invalida cache de contatos
    invalidate_cache(f"contacts:{owner_id}")


@router.post("/{contact_id}/link-identity", status_code=204)
async def link_identity(
    contact_id: UUID,
    data: LinkIdentityRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    identity_updated = False
    try:
        # 1. Atualiza identity com contact_id
        db.table("contact_identities").update(
            {"contact_id": str(contact_id)}
        ).eq("id", str(data.identity_id)).eq("owner_id", str(owner_id)).execute()
        identity_updated = True

        # 2. Atualiza conversas que usam essa identity
        db.table("conversations").update(
            {"contact_id": str(contact_id)}
        ).eq("primary_identity_id", str(data.identity_id)).eq("owner_id", str(owner_id)).execute()

    except Exception as e:
        # Rollback manual se identity foi atualizada mas conversations falhou
        if identity_updated:
            try:
                db.table("contact_identities").update(
                    {"contact_id": None}
                ).eq("id", str(data.identity_id)).eq("owner_id", str(owner_id)).execute()
            except Exception:
                pass  # Best effort rollback

        error_msg = str(e)
        # Erro de duplicata no indice de identities
        if "contact_identities_contact_type_value_idx" in error_msg:
            raise HTTPException(
                status_code=409,
                detail="Esta identity ja esta vinculada a este contato"
            )
        # Erro de duplicata na constraint de conversations
        if "conversations_owner_contact_channel_uniq" in error_msg:
            raise HTTPException(
                status_code=409,
                detail="Este contato ja esta vinculado a outra conversa neste canal"
            )
        # Qualquer outro erro de unique constraint (23505)
        if "23505" in error_msg:
            raise HTTPException(
                status_code=409,
                detail="Conflito: registro duplicado detectado"
            )
        raise  # Re-raise erros nao tratados


@router.post("/{contact_id}/unlink-identity", status_code=204)
async def unlink_identity(
    contact_id: UUID,
    data: UnlinkIdentityRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    db.table("contact_identities").update(
        {"contact_id": None}
    ).eq("id", str(data.identity_id)).eq("owner_id", str(owner_id)).execute()


@router.post("/link-by-email", response_model=LinkByEmailResponse)
async def link_contact_by_email(
    workspace_id: UUID = Query(..., description="ID do workspace"),
    request: LinkByEmailRequest = ...,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Busca ou cria contato por email.
    Se conversation_id fornecido, vincula conversa ao contato.
    """
    service = get_contact_service(db, str(owner_id), str(workspace_id))

    result = await service.get_or_create_by_email(
        email=request.email,
        display_name=request.display_name
    )

    conversation_linked = False
    if request.conversation_id:
        await service.link_conversation_to_contact(
            conversation_id=request.conversation_id,
            contact_id=result["contact"]["id"]
        )
        conversation_linked = True

    # Invalida cache de contatos (pode ter criado novo)
    if result.get("is_new"):
        invalidate_cache(f"contacts:{owner_id}:{workspace_id}")

    return LinkByEmailResponse(
        contact=result["contact"],
        identity=result["identity"],
        is_new=result["is_new"],
        conversation_linked=conversation_linked
    )


@router.get("/{contact_id}/history", response_model=ContactHistoryResponse)
async def get_contact_history(
    contact_id: UUID,
    workspace_id: UUID = Query(..., description="ID do workspace"),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Retorna historico completo do contato:
    - Compras (tabela purchases)
    - Deals vinculados
    - Conversas em todos os canais
    - Estatisticas agregadas
    """
    # Buscar contato
    contact_result = db.table("contacts").select("*").eq(
        "id", str(contact_id)
    ).eq("workspace_id", str(workspace_id)).eq(
        "owner_id", str(owner_id)
    ).single().execute()

    if not contact_result.data:
        raise HTTPException(status_code=404, detail="Contact not found")

    contact = contact_result.data

    # Buscar compras
    purchases_result = db.table("purchases").select(
        "id, product_name, amount, currency, status, purchased_at, source"
    ).eq("contact_id", str(contact_id)).order(
        "purchased_at", desc=True
    ).execute()

    # Buscar deals
    deals_result = db.table("deals").select(
        "id, title, value, stage_id, stages(name), created_at, won_at, lost_at"
    ).eq("contact_id", str(contact_id)).order(
        "created_at", desc=True
    ).execute()

    # Inferir status dos deals
    deals_with_status = []
    for deal in (deals_result.data or []):
        status = "open"
        if deal.get("won_at"):
            status = "won"
        elif deal.get("lost_at"):
            status = "lost"
        deal["status"] = status
        deals_with_status.append(deal)

    # Buscar conversas
    conversations_result = db.table("conversations").select(
        "id, channel, status, last_message_at, created_at, primary_identity_id, contact_identities(type, value)"
    ).eq("contact_id", str(contact_id)).order(
        "last_message_at", desc=True
    ).execute()

    # Calcular estatisticas
    total_purchases = sum(p.get("amount", 0) for p in (purchases_result.data or []))
    total_deals_value = sum(
        d.get("value", 0) for d in deals_with_status if d.get("status") == "won"
    )

    stats = {
        "total_purchases": len(purchases_result.data or []),
        "total_purchases_value": total_purchases,
        "total_deals": len(deals_with_status),
        "total_deals_won_value": total_deals_value,
        "total_conversations": len(conversations_result.data or [])
    }

    return ContactHistoryResponse(
        contact=contact,
        purchases=purchases_result.data or [],
        deals=deals_with_status,
        conversations=conversations_result.data or [],
        stats=stats
    )
