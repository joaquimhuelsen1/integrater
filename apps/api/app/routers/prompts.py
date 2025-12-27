"""
Router de Prompts - CRUD com versionamento (M6).
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from supabase import Client
from uuid import UUID
from typing import Optional

from ..deps import get_supabase, get_owner_id
from ..services.gemini import get_gemini_service


router = APIRouter(prefix="/prompts", tags=["prompts"])


# Prompts padrão do sistema
DEFAULT_PROMPTS = [
    {
        "name": "reply_suggestion",
        "description": "Prompt para sugerir respostas em inglês",
        "prompt_type": "reply_suggestion",
        "content": """You are a helpful sales assistant. Based on the conversation below, suggest a professional and friendly response in English.

The response should:
- Be concise and to the point
- Match the tone of the conversation
- Move the conversation forward
- Be written in English

Conversation:
{conversation}

Suggested response:""",
    },
    {
        "name": "summary",
        "description": "Prompt para resumir conversas em português",
        "prompt_type": "summary",
        "content": """Você é um assistente que resume conversas de vendas. Resuma a conversa abaixo em português brasileiro.

O resumo deve incluir:
- Contexto principal da conversa
- Pontos-chave discutidos
- Status atual (interesse do lead, próximos passos)
- Qualquer informação importante mencionada

Conversa:
{conversation}

Resumo:""",
    },
    {
        "name": "draft_translation",
        "description": "Prompt para traduzir mensagens PT→EN (Gemini Pro)",
        "prompt_type": "draft_translation",
        "content": """You are a professional translator helping a sales representative communicate with international leads.

Translate the following message from Portuguese to English.

Rules:
- Maintain professional but friendly tone
- Preserve meaning and intent exactly
- Keep proper nouns, brand names, and technical terms as-is
- Adapt idioms and expressions naturally
- Do NOT explain or add anything - just translate

Message in Portuguese:
{text}

Translation to English:""",
    },
]


class PromptCreate(BaseModel):
    """Request para criar prompt."""
    name: str
    description: Optional[str] = None
    prompt_type: str = "custom"
    content: str


class PromptUpdate(BaseModel):
    """Request para atualizar prompt."""
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    is_active: Optional[bool] = None


class PromptResponse(BaseModel):
    """Response com dados do prompt."""
    id: str
    name: str
    description: Optional[str]
    prompt_type: str
    content: str
    is_active: bool
    version: int
    created_at: str
    updated_at: str


class PromptVersionResponse(BaseModel):
    """Response com versão do prompt."""
    id: str
    prompt_id: str
    version: int
    content: str
    created_at: str
    change_reason: Optional[str]


class PromptTestRequest(BaseModel):
    """Request para testar prompt."""
    conversation_text: str


class PromptTestResponse(BaseModel):
    """Response do teste de prompt."""
    result: str


@router.get("/", response_model=list[PromptResponse])
async def list_prompts(
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Lista todos os prompts do usuário."""
    result = db.table("prompts").select("*").eq(
        "owner_id", owner_id
    ).order("name").execute()

    # Verifica se falta algum prompt padrão
    existing_types = {p["prompt_type"] for p in (result.data or [])}
    for default in DEFAULT_PROMPTS:
        if default["prompt_type"] not in existing_types:
            db.table("prompts").insert({
                "owner_id": owner_id,
                **default,
            }).execute()

    # Busca novamente se criou algum
    if len(existing_types) < len(DEFAULT_PROMPTS):
        result = db.table("prompts").select("*").eq(
            "owner_id", owner_id
        ).order("name").execute()

    return result.data or []


@router.get("/{prompt_id}", response_model=PromptResponse)
async def get_prompt(
    prompt_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Busca um prompt específico."""
    result = db.table("prompts").select("*").eq(
        "id", str(prompt_id)
    ).eq("owner_id", owner_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Prompt não encontrado")

    return result.data


@router.post("/", response_model=PromptResponse)
async def create_prompt(
    request: PromptCreate,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Cria um novo prompt."""
    result = db.table("prompts").insert({
        "owner_id": owner_id,
        "name": request.name,
        "description": request.description,
        "prompt_type": request.prompt_type,
        "content": request.content,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao criar prompt")

    return result.data[0]


@router.put("/{prompt_id}", response_model=PromptResponse)
async def update_prompt(
    prompt_id: UUID,
    request: PromptUpdate,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Atualiza um prompt (cria nova versão se content mudar)."""
    # Verifica se existe
    check = db.table("prompts").select("id").eq(
        "id", str(prompt_id)
    ).eq("owner_id", owner_id).execute()

    if not check.data:
        raise HTTPException(status_code=404, detail="Prompt não encontrado")

    # Monta update
    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.description is not None:
        update_data["description"] = request.description
    if request.content is not None:
        update_data["content"] = request.content
    if request.is_active is not None:
        update_data["is_active"] = request.is_active

    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    result = db.table("prompts").update(update_data).eq(
        "id", str(prompt_id)
    ).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao atualizar prompt")

    return result.data[0]


@router.delete("/{prompt_id}")
async def delete_prompt(
    prompt_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Deleta um prompt."""
    result = db.table("prompts").delete().eq(
        "id", str(prompt_id)
    ).eq("owner_id", owner_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Prompt não encontrado")

    return {"deleted": True}


@router.get("/{prompt_id}/versions", response_model=list[PromptVersionResponse])
async def list_prompt_versions(
    prompt_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Lista histórico de versões de um prompt."""
    # Verifica ownership
    check = db.table("prompts").select("id").eq(
        "id", str(prompt_id)
    ).eq("owner_id", owner_id).execute()

    if not check.data:
        raise HTTPException(status_code=404, detail="Prompt não encontrado")

    result = db.table("prompt_versions").select("*").eq(
        "prompt_id", str(prompt_id)
    ).order("version", desc=True).execute()

    return result.data or []


@router.post("/{prompt_id}/revert/{version}")
async def revert_prompt_version(
    prompt_id: UUID,
    version: int,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Reverte prompt para uma versão anterior."""
    # Verifica ownership
    check = db.table("prompts").select("id, version").eq(
        "id", str(prompt_id)
    ).eq("owner_id", owner_id).single().execute()

    if not check.data:
        raise HTTPException(status_code=404, detail="Prompt não encontrado")

    # Busca versão específica
    version_result = db.table("prompt_versions").select("content").eq(
        "prompt_id", str(prompt_id)
    ).eq("version", version).single().execute()

    if not version_result.data:
        raise HTTPException(status_code=404, detail="Versão não encontrada")

    # Atualiza com conteúdo da versão antiga (isso cria nova versão automaticamente)
    result = db.table("prompts").update({
        "content": version_result.data["content"],
    }).eq("id", str(prompt_id)).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao reverter")

    return {"reverted_to": version, "new_version": result.data[0]["version"]}


@router.post("/{prompt_id}/test", response_model=PromptTestResponse)
async def test_prompt(
    prompt_id: UUID,
    request: PromptTestRequest,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Testa um prompt com texto de conversa."""
    # Busca prompt
    result = db.table("prompts").select("content, prompt_type").eq(
        "id", str(prompt_id)
    ).eq("owner_id", owner_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Prompt não encontrado")

    # Monta prompt final
    prompt_content = result.data["content"]
    final_prompt = prompt_content.replace("{conversation}", request.conversation_text)

    # Executa no Gemini
    gemini = get_gemini_service()
    try:
        # Usa Pro para testes
        response = await gemini._generate(gemini.pro_model, final_prompt)
        return PromptTestResponse(result=response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao executar: {e}")
