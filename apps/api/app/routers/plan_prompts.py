"""
Router para Prompts de Planos de Relacionamento.

Gerencia prompts customizados para geração de planos:
- system: Prompt principal do sistema
- structure_context: Contexto para geracao de estrutura
- intro_context: Contexto para geracao de introducao
- block_deepen: Contexto para aprofundamento de blocos
- summary_context: Contexto para geracao de resumo
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.deps import get_supabase, get_current_user_id
from app.models import (
    PlanPromptCreate,
    PlanPromptUpdate,
    PlanPromptResponse,
    PlanPromptListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plan-prompts", tags=["plan-prompts"])


def _get_workspace_id(db: Client, owner_id: UUID) -> str:
    """Obtem workspace_id do usuario (primeiro workspace)."""
    result = (
        db.table("workspaces")
        .select("id")
        .eq("owner_id", str(owner_id))
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")
    return result.data[0]["id"]


@router.get("", response_model=PlanPromptListResponse)
async def list_plan_prompts(
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
    prompt_type: str | None = None,
    is_active: bool | None = None,
):
    """
    Lista prompts do workspace.

    Filtros opcionais:
    - prompt_type: Tipo de prompt (system, structure_context, etc)
    - is_active: Apenas prompts ativos
    """
    workspace_id = _get_workspace_id(db, owner_id)

    query = (
        db.table("plan_prompts")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("owner_id", str(owner_id))
        .order("created_at", desc=True)
    )

    if prompt_type:
        query = query.eq("prompt_type", prompt_type)

    if is_active is not None:
        query = query.eq("is_active", is_active)

    result = query.execute()

    # Count total
    count_query = (
        db.table("plan_prompts")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("owner_id", str(owner_id))
    )
    if prompt_type:
        count_query = count_query.eq("prompt_type", prompt_type)
    if is_active is not None:
        count_query = count_query.eq("is_active", is_active)

    count_result = count_query.execute()
    total = len(count_result.data) if count_result.data else 0

    return PlanPromptListResponse(prompts=result.data or [], total=total)


@router.post("", response_model=PlanPromptResponse, status_code=201)
async def create_plan_prompt(
    data: PlanPromptCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Cria novo prompt customizado.

    Se ja existir prompt com mesmo nome no workspace, retorna erro.
    """
    workspace_id = _get_workspace_id(db, owner_id)

    payload = data.model_dump()
    payload["owner_id"] = str(owner_id)
    payload["workspace_id"] = workspace_id

    try:
        result = db.table("plan_prompts").insert(payload).execute()
        return result.data[0]
    except Exception as e:
        logger.error(f"Erro ao criar prompt: {e}")
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(
                status_code=400,
                detail=f"Ja existe um prompt com nome '{data.name}' neste workspace",
            )
        raise


@router.get("/{prompt_id}", response_model=PlanPromptResponse)
async def get_plan_prompt(
    prompt_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna detalhes de um prompt."""
    workspace_id = _get_workspace_id(db, owner_id)

    result = (
        db.table("plan_prompts")
        .select("*")
        .eq("id", str(prompt_id))
        .eq("workspace_id", workspace_id)
        .eq("owner_id", str(owner_id))
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Prompt não encontrado")

    return result.data


@router.patch("/{prompt_id}", response_model=PlanPromptResponse)
async def update_plan_prompt(
    prompt_id: UUID,
    data: PlanPromptUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Atualiza prompt existente.

    Ao modificar o conteudo, uma nova versao e criada automaticamente
    na tabela plan_prompt_versions (via trigger).
    """
    workspace_id = _get_workspace_id(db, owner_id)

    payload = data.model_dump(exclude_unset=True)

    result = (
        db.table("plan_prompts")
        .update(payload)
        .eq("id", str(prompt_id))
        .eq("workspace_id", workspace_id)
        .eq("owner_id", str(owner_id))
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Prompt não encontrado")

    return result.data[0]


@router.delete("/{prompt_id}", status_code=204)
async def delete_plan_prompt(
    prompt_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Remove um prompt ( CASCADE remove versoes associadas )."""
    workspace_id = _get_workspace_id(db, owner_id)

    result = (
        db.table("plan_prompts")
        .delete()
        .eq("id", str(prompt_id))
        .eq("workspace_id", workspace_id)
        .eq("owner_id", str(owner_id))
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Prompt não encontrado")


@router.get("/{prompt_id}/versions")
async def list_plan_prompt_versions(
    prompt_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista versoes historicas de um prompt."""
    workspace_id = _get_workspace_id(db, owner_id)

    # Verifica se prompt existe e pertence ao usuario
    prompt_check = (
        db.table("plan_prompts")
        .select("id")
        .eq("id", str(prompt_id))
        .eq("workspace_id", workspace_id)
        .eq("owner_id", str(owner_id))
        .execute()
    )

    if not prompt_check.data:
        raise HTTPException(status_code=404, detail="Prompt não encontrado")

    # Busca versoes
    result = (
        db.table("plan_prompt_versions")
        .select("*")
        .eq("prompt_id", str(prompt_id))
        .order("version", desc=False)
        .execute()
    )

    return {"versions": result.data or [], "total": len(result.data or [])}


@router.post("/default/{prompt_type}", response_model=PlanPromptResponse, status_code=201)
async def create_default_prompt(
    prompt_type: str,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Cria prompt com conteudo padrao do sistema.

    Tipos validos: plan_system, structure_context, intro_context,
                   block_deepen, summary_context
    """
    from app.services.glm import DEFAULT_PLAN_PROMPTS

    type_map = {
        "plan_system": "system",
        "structure_context": "structure",
        "intro_context": "introduction",
        "block_deepen": "deepen_block",
        "summary_context": "summary",
    }

    if prompt_type not in type_map:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo invalido. Opcoes: {list(type_map.keys())}",
        )

    workspace_id = _get_workspace_id(db, owner_id)
    glm_key = type_map[prompt_type]
    default_content = DEFAULT_PLAN_PROMPTS.get(glm_key, "")

    prompt_data = {
        "owner_id": str(owner_id),
        "workspace_id": workspace_id,
        "name": f"Default {prompt_type}",
        "description": f"Prompt padrao do sistema para {prompt_type}",
        "prompt_type": prompt_type,
        "content": default_content,
        "is_active": True,
    }

    result = db.table("plan_prompts").insert(prompt_data).execute()
    return result.data[0]
