from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from supabase import Client
from uuid import UUID

from app.deps import get_supabase, get_current_user_id

router = APIRouter(prefix="/integrations", tags=["integrations"])


class IntegrationAccountResponse(BaseModel):
    id: str
    type: str
    account_name: str | None  # campo label do banco
    is_active: bool


@router.get("", response_model=list[IntegrationAccountResponse])
async def list_integrations(
    type: str | None = Query(
        default=None,
        description="Filtrar por tipo: email_imap_smtp, openphone, telegram_user"
    ),
    workspace_id: UUID | None = Query(
        default=None,
        description="Filtrar por workspace"
    ),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Lista integration_accounts do usuario autenticado.

    Query params:
    - type: Filtra por tipo de integracao (email_imap_smtp, openphone, telegram_user)
    - workspace_id: Filtra por workspace (opcional)
    """
    query = db.table("integration_accounts").select(
        "id, type, label, is_active"
    ).eq("owner_id", str(owner_id))

    if type:
        query = query.eq("type", type)

    if workspace_id:
        query = query.eq("workspace_id", str(workspace_id))

    result = query.execute()

    # Mapeia label -> account_name na resposta
    return [
        IntegrationAccountResponse(
            id=row["id"],
            type=row["type"],
            account_name=row.get("label"),
            is_active=row.get("is_active", True)
        )
        for row in result.data
    ]
