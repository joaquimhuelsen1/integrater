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


class ContactHistoryResponse(BaseModel):
    contact: dict
    purchases: list[dict] = []
    deals: list[dict] = []
    conversations: list[dict] = []
    stats: dict = {}

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", response_model=list[Contact])
async def list_contacts(
    workspace_id: UUID = Query(..., description="ID do workspace"),
    search: str | None = None,
    cursor: UUID | None = None,
    limit: int = Query(default=50, le=100),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    query = db.table("contacts").select("*").eq(
        "owner_id", str(owner_id)
    ).eq("workspace_id", str(workspace_id)).is_("deleted_at", "null")

    if search:
        query = query.ilike("display_name", f"%{search}%")

    if cursor:
        query = query.lt("id", str(cursor))

    result = query.order("created_at", desc=True).limit(limit).execute()
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


@router.post("/{contact_id}/link-identity", status_code=204)
async def link_identity(
    contact_id: UUID,
    data: LinkIdentityRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    # 1. Atualiza identity com contact_id
    db.table("contact_identities").update(
        {"contact_id": str(contact_id)}
    ).eq("id", str(data.identity_id)).eq("owner_id", str(owner_id)).execute()

    # 2. Atualiza conversas que usam essa identity
    try:
        db.table("conversations").update(
            {"contact_id": str(contact_id)}
        ).eq("primary_identity_id", str(data.identity_id)).eq("owner_id", str(owner_id)).execute()
    except Exception as e:
        error_msg = str(e)
        if "conversations_owner_contact_channel_uniq" in error_msg or "23505" in error_msg:
            raise HTTPException(
                status_code=409,
                detail="Este contato já está vinculado a outra conversa neste canal"
            )
        raise


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
