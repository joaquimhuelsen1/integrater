"""
Router de Configuração de IA - Gerenciar modelos e configurações por função.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from supabase import Client
from uuid import UUID
from typing import Optional

from ..deps import get_supabase, get_owner_id


router = APIRouter(prefix="/ai-config", tags=["ai-config"])


# Funções disponíveis para configuração
AI_FUNCTIONS = [
    {
        "key": "draft_translation",
        "name": "Tradução de Rascunho",
        "description": "Traduz mensagens PT→EN antes de enviar",
    },
    {
        "key": "reply_suggestion",
        "name": "Sugestão de Resposta",
        "description": "Sugere respostas em inglês baseado na conversa",
    },
    {
        "key": "summary",
        "name": "Resumo de Conversa",
        "description": "Resume conversas em português",
    },
    {
        "key": "transcription",
        "name": "Transcrição de Áudio",
        "description": "Transcreve áudios para texto",
    },
]

# Modelos padrão
DEFAULT_MODELS = [
    {
        "provider": "google",
        "model_id": "gemini-2.5-flash-preview-05-20",
        "name": "Gemini 2.5 Flash",
        "description": "Rápido e econômico, bom para tarefas simples",
    },
    {
        "provider": "google",
        "model_id": "gemini-2.5-pro-preview-05-06",
        "name": "Gemini 2.5 Pro",
        "description": "Mais inteligente, melhor para tarefas complexas",
    },
    {
        "provider": "google",
        "model_id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "description": "Versão estável do Flash",
    },
]


class ModelCreate(BaseModel):
    """Request para criar modelo."""
    provider: str = "google"
    model_id: str
    name: str
    description: Optional[str] = None


class ModelUpdate(BaseModel):
    """Request para atualizar modelo."""
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ModelResponse(BaseModel):
    """Response com dados do modelo."""
    id: str
    provider: str
    model_id: str
    name: str
    description: Optional[str]
    is_active: bool
    created_at: str


class ConfigUpdate(BaseModel):
    """Request para atualizar configuração de função."""
    model_id: str


class ConfigResponse(BaseModel):
    """Response com configuração de função."""
    function_key: str
    function_name: str
    function_description: str
    model_id: Optional[str]
    model_name: Optional[str]


class FunctionInfo(BaseModel):
    """Info sobre uma função de IA."""
    key: str
    name: str
    description: str


@router.get("/functions", response_model=list[FunctionInfo])
async def list_functions():
    """Lista todas as funções de IA configuráveis."""
    return AI_FUNCTIONS


@router.get("/models", response_model=list[ModelResponse])
async def list_models(
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Lista todos os modelos disponíveis."""
    result = db.table("ai_models").select("*").eq(
        "owner_id", owner_id
    ).order("name").execute()

    # Se não tem modelos, cria os padrões
    if not result.data:
        for default in DEFAULT_MODELS:
            db.table("ai_models").insert({
                "owner_id": owner_id,
                **default,
            }).execute()

        result = db.table("ai_models").select("*").eq(
            "owner_id", owner_id
        ).order("name").execute()

    return result.data or []


@router.post("/models", response_model=ModelResponse)
async def create_model(
    request: ModelCreate,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Adiciona um novo modelo."""
    # Verifica se já existe
    existing = db.table("ai_models").select("id").eq(
        "owner_id", owner_id
    ).eq("model_id", request.model_id).execute()

    if existing.data:
        raise HTTPException(400, "Modelo já existe")

    result = db.table("ai_models").insert({
        "owner_id": owner_id,
        "provider": request.provider,
        "model_id": request.model_id,
        "name": request.name,
        "description": request.description,
    }).execute()

    if not result.data:
        raise HTTPException(500, "Erro ao criar modelo")

    return result.data[0]


@router.put("/models/{model_uuid}", response_model=ModelResponse)
async def update_model(
    model_uuid: UUID,
    request: ModelUpdate,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Atualiza um modelo."""
    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.description is not None:
        update_data["description"] = request.description
    if request.is_active is not None:
        update_data["is_active"] = request.is_active

    if not update_data:
        raise HTTPException(400, "Nada para atualizar")

    result = db.table("ai_models").update(update_data).eq(
        "id", str(model_uuid)
    ).eq("owner_id", owner_id).execute()

    if not result.data:
        raise HTTPException(404, "Modelo não encontrado")

    return result.data[0]


@router.delete("/models/{model_uuid}")
async def delete_model(
    model_uuid: UUID,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Remove um modelo."""
    result = db.table("ai_models").delete().eq(
        "id", str(model_uuid)
    ).eq("owner_id", owner_id).execute()

    if not result.data:
        raise HTTPException(404, "Modelo não encontrado")

    return {"deleted": True}


@router.get("/config", response_model=list[ConfigResponse])
async def get_config(
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Retorna configuração de modelos para cada função."""
    # Busca configurações existentes
    config_result = db.table("ai_function_config").select(
        "function_key, model_id"
    ).eq("owner_id", owner_id).execute()

    config_map = {c["function_key"]: c["model_id"] for c in (config_result.data or [])}

    # Busca modelos para pegar nomes
    models_result = db.table("ai_models").select(
        "model_id, name"
    ).eq("owner_id", owner_id).execute()

    model_names = {m["model_id"]: m["name"] for m in (models_result.data or [])}

    # Monta resposta
    configs = []
    for func in AI_FUNCTIONS:
        model_id = config_map.get(func["key"])
        configs.append(ConfigResponse(
            function_key=func["key"],
            function_name=func["name"],
            function_description=func["description"],
            model_id=model_id,
            model_name=model_names.get(model_id) if model_id else None,
        ))

    return configs


@router.put("/config/{function_key}")
async def update_config(
    function_key: str,
    request: ConfigUpdate,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Atualiza modelo usado para uma função."""
    # Valida função
    valid_keys = [f["key"] for f in AI_FUNCTIONS]
    if function_key not in valid_keys:
        raise HTTPException(400, f"Função inválida. Use: {valid_keys}")

    # Verifica se já existe config
    existing = db.table("ai_function_config").select("id").eq(
        "owner_id", owner_id
    ).eq("function_key", function_key).execute()

    if existing.data:
        # Update
        db.table("ai_function_config").update({
            "model_id": request.model_id,
        }).eq("id", existing.data[0]["id"]).execute()
    else:
        # Insert
        db.table("ai_function_config").insert({
            "owner_id": owner_id,
            "function_key": function_key,
            "model_id": request.model_id,
        }).execute()

    return {"updated": True, "function_key": function_key, "model_id": request.model_id}


@router.get("/config/{function_key}/model")
async def get_function_model(
    function_key: str,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Retorna o model_id configurado para uma função (usado internamente)."""
    result = db.table("ai_function_config").select("model_id").eq(
        "owner_id", owner_id
    ).eq("function_key", function_key).execute()

    if result.data:
        return {"model_id": result.data[0]["model_id"]}

    # Se não tem config, retorna o primeiro modelo disponível
    models = db.table("ai_models").select("model_id").eq(
        "owner_id", owner_id
    ).eq("is_active", True).limit(1).execute()

    if models.data:
        return {"model_id": models.data[0]["model_id"]}

    return {"model_id": None}
