"""
Router Workspaces - CRUD de workspaces.
"""
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from uuid import UUID
import secrets

from app.deps import get_supabase, get_current_user_id
from app.models.workspace import (
    Workspace,
    WorkspaceCreate,
    WorkspaceUpdate,
)


def generate_workspace_api_key() -> str:
    """Gera API key única para workspace."""
    return f"wk_{secrets.token_hex(24)}"

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[Workspace])
async def list_workspaces(
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista todos os workspaces do usuário."""
    result = db.table("workspaces").select("*").eq(
        "owner_id", str(owner_id)
    ).order("is_default", desc=True).order("created_at").execute()

    return result.data


@router.post("", response_model=Workspace, status_code=201)
async def create_workspace(
    data: WorkspaceCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Cria novo workspace e gera API key automaticamente."""
    payload = data.model_dump()
    payload["owner_id"] = str(owner_id)
    payload["is_default"] = False  # Novos workspaces nunca são default

    result = db.table("workspaces").insert(payload).execute()
    workspace = result.data[0]

    # Gera API key automaticamente
    db.table("workspace_api_keys").insert({
        "workspace_id": workspace["id"],
        "api_key": generate_workspace_api_key()
    }).execute()

    return workspace


@router.post("/migrate-data")
async def migrate_data_to_default_workspace(
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Migra dados sem workspace_id para o workspace default."""
    # Busca workspace default
    default_ws = db.table("workspaces").select("id").eq(
        "owner_id", str(owner_id)
    ).eq("is_default", True).single().execute()

    if not default_ws.data:
        raise HTTPException(status_code=404, detail="Workspace default não encontrado")

    default_id = default_ws.data["id"]

    # Migra integration_accounts
    db.table("integration_accounts").update({"workspace_id": default_id}).eq(
        "owner_id", str(owner_id)
    ).is_("workspace_id", "null").execute()

    # Migra conversations
    db.table("conversations").update({"workspace_id": default_id}).eq(
        "owner_id", str(owner_id)
    ).is_("workspace_id", "null").execute()

    # Migra contacts
    db.table("contacts").update({"workspace_id": default_id}).eq(
        "owner_id", str(owner_id)
    ).is_("workspace_id", "null").execute()

    # Migra pipelines
    db.table("pipelines").update({"workspace_id": default_id}).eq(
        "owner_id", str(owner_id)
    ).is_("workspace_id", "null").execute()

    return {"success": True, "workspace_id": default_id}


@router.get("/{workspace_id}", response_model=Workspace)
async def get_workspace(
    workspace_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna detalhes do workspace."""
    result = db.table("workspaces").select("*").eq(
        "id", str(workspace_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    return result.data


@router.patch("/{workspace_id}", response_model=Workspace)
async def update_workspace(
    workspace_id: UUID,
    data: WorkspaceUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Atualiza workspace."""
    payload = data.model_dump(exclude_unset=True)

    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    result = db.table("workspaces").update(payload).eq(
        "id", str(workspace_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    return result.data[0]


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace(
    workspace_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Remove workspace (não pode remover o default)."""
    # Verifica se é o default
    workspace = db.table("workspaces").select("is_default").eq(
        "id", str(workspace_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not workspace.data:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    if workspace.data.get("is_default"):
        raise HTTPException(
            status_code=400,
            detail="Não é possível remover o workspace principal"
        )

    # Remove workspace (CASCADE deleta dados relacionados)
    db.table("workspaces").delete().eq(
        "id", str(workspace_id)
    ).eq("owner_id", str(owner_id)).execute()


@router.post("/{workspace_id}/set-default", response_model=Workspace)
async def set_default_workspace(
    workspace_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Define workspace como default."""
    # Verifica se workspace existe
    workspace = db.table("workspaces").select("id").eq(
        "id", str(workspace_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not workspace.data:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    # Remove default de todos
    db.table("workspaces").update({"is_default": False}).eq(
        "owner_id", str(owner_id)
    ).execute()

    # Define o novo default
    result = db.table("workspaces").update({"is_default": True}).eq(
        "id", str(workspace_id)
    ).eq("owner_id", str(owner_id)).execute()

    return result.data[0]


# ============================================
# API Key endpoints
# ============================================

@router.get("/{workspace_id}/api-key")
async def get_workspace_api_key(
    workspace_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna API key do workspace."""
    # Verifica se workspace pertence ao usuário
    workspace = db.table("workspaces").select("id").eq(
        "id", str(workspace_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not workspace.data:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    # Busca API key
    api_key_result = db.table("workspace_api_keys").select("*").eq(
        "workspace_id", str(workspace_id)
    ).execute()

    if not api_key_result.data:
        return None

    return api_key_result.data[0]


@router.post("/{workspace_id}/api-key")
async def create_or_regenerate_workspace_api_key(
    workspace_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Cria ou regenera API key do workspace."""
    # Verifica se workspace pertence ao usuário
    workspace = db.table("workspaces").select("id").eq(
        "id", str(workspace_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not workspace.data:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    new_api_key = generate_workspace_api_key()

    # Verifica se já existe
    existing = db.table("workspace_api_keys").select("id").eq(
        "workspace_id", str(workspace_id)
    ).execute()

    if existing.data:
        # Atualiza
        result = db.table("workspace_api_keys").update({
            "api_key": new_api_key,
            "updated_at": "now()"
        }).eq("workspace_id", str(workspace_id)).execute()
    else:
        # Cria nova
        result = db.table("workspace_api_keys").insert({
            "workspace_id": str(workspace_id),
            "api_key": new_api_key
        }).execute()

    return result.data[0]


@router.get("/{workspace_id}/api-keys")
async def list_workspace_api_keys(
    workspace_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista todas as API keys ativas do workspace."""
    workspace = db.table("workspaces").select("id").eq(
        "id", str(workspace_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not workspace.data:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    result = db.table("workspace_api_keys").select("*").eq(
        "workspace_id", str(workspace_id)
    ).eq("is_active", True).order("created_at").execute()

    return result.data


@router.delete("/{workspace_id}/api-keys/{key_id}", status_code=204)
async def revoke_workspace_api_key(
    workspace_id: UUID,
    key_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Revoga (desativa) uma API key do workspace."""
    workspace = db.table("workspaces").select("id").eq(
        "id", str(workspace_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not workspace.data:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    result = db.table("workspace_api_keys").update({
        "is_active": False
    }).eq("id", str(key_id)).eq(
        "workspace_id", str(workspace_id)
    ).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="API key não encontrada")
