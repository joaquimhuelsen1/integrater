"""
Router Pipelines - CRUD de pipelines e stages (CRM).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from uuid import UUID

from app.deps import get_supabase, get_current_user_id
from app.models.crm import (
    Pipeline,
    PipelineCreate,
    PipelineUpdate,
    PipelineWithStages,
    Stage,
    StageCreate,
    StageUpdate,
    StageReorderRequest,
)

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


# ============================================
# Pipelines
# ============================================
@router.get("", response_model=list[Pipeline])
async def list_pipelines(
    workspace_id: UUID = Query(..., description="ID do workspace"),
    include_archived: bool = False,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista todos os pipelines do workspace."""
    query = db.table("pipelines").select("*").eq(
        "owner_id", str(owner_id)
    ).eq("workspace_id", str(workspace_id))

    if not include_archived:
        query = query.eq("is_archived", False)

    result = query.order("position").execute()
    return result.data


@router.post("", response_model=Pipeline, status_code=201)
async def create_pipeline(
    data: PipelineCreate,
    workspace_id: UUID = Query(..., description="ID do workspace"),
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Cria novo pipeline com stages padrão."""
    # Busca próxima posição
    count_result = db.table("pipelines").select(
        "id", count="exact"
    ).eq("owner_id", str(owner_id)).eq("workspace_id", str(workspace_id)).execute()
    next_position = count_result.count or 0

    payload = data.model_dump()
    payload["owner_id"] = str(owner_id)
    payload["workspace_id"] = str(workspace_id)
    payload["position"] = next_position

    result = db.table("pipelines").insert(payload).execute()
    pipeline = result.data[0]

    # Cria stages padrão
    default_stages = [
        {"name": "Novo", "color": "#6b7280", "position": 0},
        {"name": "Em Contato", "color": "#3b82f6", "position": 1},
        {"name": "Proposta", "color": "#8b5cf6", "position": 2},
        {"name": "Negociação", "color": "#f59e0b", "position": 3},
        {"name": "Ganho", "color": "#22c55e", "position": 4, "is_win": True},
        {"name": "Perdido", "color": "#ef4444", "position": 5, "is_loss": True},
    ]

    for stage in default_stages:
        stage["owner_id"] = str(owner_id)
        stage["pipeline_id"] = pipeline["id"]
        db.table("stages").insert(stage).execute()

    return pipeline


@router.get("/{pipeline_id}", response_model=PipelineWithStages)
async def get_pipeline(
    pipeline_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna pipeline com suas stages."""
    result = db.table("pipelines").select("*").eq(
        "id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Pipeline não encontrado")

    # Busca stages
    stages_result = db.table("stages").select("*").eq(
        "pipeline_id", str(pipeline_id)
    ).order("position").execute()

    pipeline = result.data
    pipeline["stages"] = stages_result.data or []

    return pipeline


@router.patch("/{pipeline_id}", response_model=Pipeline)
async def update_pipeline(
    pipeline_id: UUID,
    data: PipelineUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Atualiza pipeline."""
    payload = data.model_dump(exclude_unset=True)

    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    result = db.table("pipelines").update(payload).eq(
        "id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Pipeline não encontrado")

    return result.data[0]


@router.delete("/{pipeline_id}", status_code=204)
async def archive_pipeline(
    pipeline_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Arquiva pipeline (soft delete)."""
    result = db.table("pipelines").update(
        {"is_archived": True}
    ).eq("id", str(pipeline_id)).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Pipeline não encontrado")


# ============================================
# Stages
# ============================================
@router.get("/{pipeline_id}/stages", response_model=list[Stage])
async def list_stages(
    pipeline_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Lista stages do pipeline."""
    result = db.table("stages").select("*").eq(
        "pipeline_id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).order("position").execute()

    return result.data


@router.post("/{pipeline_id}/stages", response_model=Stage, status_code=201)
async def create_stage(
    pipeline_id: UUID,
    data: StageCreate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Cria nova stage no pipeline."""
    # Verifica se pipeline existe
    pipeline = db.table("pipelines").select("id").eq(
        "id", str(pipeline_id)
    ).eq("owner_id", str(owner_id)).single().execute()

    if not pipeline.data:
        raise HTTPException(status_code=404, detail="Pipeline não encontrado")

    # Busca próxima posição
    count_result = db.table("stages").select(
        "id", count="exact"
    ).eq("pipeline_id", str(pipeline_id)).execute()
    next_position = count_result.count or 0

    payload = data.model_dump()
    payload["owner_id"] = str(owner_id)
    payload["pipeline_id"] = str(pipeline_id)
    payload["position"] = next_position

    result = db.table("stages").insert(payload).execute()
    return result.data[0]


@router.patch("/{pipeline_id}/stages/{stage_id}", response_model=Stage)
async def update_stage(
    pipeline_id: UUID,
    stage_id: UUID,
    data: StageUpdate,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Atualiza stage."""
    payload = data.model_dump(exclude_unset=True)

    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    result = db.table("stages").update(payload).eq(
        "id", str(stage_id)
    ).eq("pipeline_id", str(pipeline_id)).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Stage não encontrada")

    return result.data[0]


@router.delete("/{pipeline_id}/stages/{stage_id}", status_code=204)
async def delete_stage(
    pipeline_id: UUID,
    stage_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Remove stage (falha se houver deals)."""
    # Verifica se há deals na stage
    deals_count = db.table("deals").select(
        "id", count="exact"
    ).eq("stage_id", str(stage_id)).execute()

    if deals_count.count and deals_count.count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Não é possível remover: {deals_count.count} deal(s) nesta etapa"
        )

    result = db.table("stages").delete().eq(
        "id", str(stage_id)
    ).eq("pipeline_id", str(pipeline_id)).eq("owner_id", str(owner_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Stage não encontrada")


@router.post("/{pipeline_id}/stages/reorder", status_code=204)
async def reorder_stages(
    pipeline_id: UUID,
    data: StageReorderRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Reordena stages do pipeline."""
    for position, stage_id in enumerate(data.stage_ids):
        db.table("stages").update({"position": position}).eq(
            "id", str(stage_id)
        ).eq("pipeline_id", str(pipeline_id)).eq("owner_id", str(owner_id)).execute()
