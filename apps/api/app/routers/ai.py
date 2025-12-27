"""
Router de IA - Sugestão de resposta e resumo de conversa (M5).
Usa prompts customizados do banco quando disponíveis.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from supabase import Client
from uuid import UUID

from ..deps import get_supabase, get_owner_id
from ..services.gemini import get_gemini_service


router = APIRouter(prefix="/ai", tags=["ai"])


def _get_user_prompt(db: Client, owner_id: str, prompt_type: str) -> str | None:
    """Busca prompt customizado do usuário."""
    result = db.table("prompts").select("content").eq(
        "owner_id", owner_id
    ).eq("prompt_type", prompt_type).eq("is_active", True).limit(1).execute()

    if result.data:
        return result.data[0]["content"]
    return None


class SuggestRequest(BaseModel):
    """Request para sugestão de resposta."""
    pass  # Sem parâmetros extras por enquanto


class SuggestResponse(BaseModel):
    """Response com sugestão de resposta."""
    suggestion_id: str
    content: str
    suggestion_type: str = "reply_suggestion"


class SummaryResponse(BaseModel):
    """Response com resumo da conversa."""
    suggestion_id: str
    content: str
    suggestion_type: str = "summary"


class FeedbackRequest(BaseModel):
    """Request para registrar feedback."""
    action: str  # accepted, rejected, edited
    final_content: str | None = None


class FeedbackResponse(BaseModel):
    """Response do feedback."""
    feedback_id: str
    action: str


def _build_conversation_text(messages: list) -> str:
    """Constrói texto da conversa para contexto da IA."""
    lines = []
    for msg in messages:
        direction = "Lead" if msg.get("direction") == "inbound" else "Você"
        text = msg.get("text") or "[anexo]"
        lines.append(f"{direction}: {text}")
    return "\n".join(lines)


@router.post("/conversation/{conversation_id}/suggest", response_model=SuggestResponse)
async def suggest_reply(
    conversation_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """
    Gera sugestão de resposta em inglês para a conversa.
    Usa Gemini Pro para gerar resposta contextualizada.
    """
    # Busca mensagens da conversa
    result = db.table("messages").select("*").eq(
        "conversation_id", str(conversation_id)
    ).order("sent_at", desc=False).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Conversa não encontrada ou vazia")

    # Monta contexto
    conversation_text = _build_conversation_text(result.data)

    # Busca prompt customizado do usuário
    custom_prompt = _get_user_prompt(db, owner_id, "reply_suggestion")

    # Gera sugestão
    gemini = get_gemini_service()
    try:
        suggestion = await gemini.suggest_reply(conversation_text, custom_prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar sugestão: {e}")

    # Salva no banco (sem suggestion_type por enquanto - problema com enum)
    insert_result = db.table("ai_suggestions").insert({
        "owner_id": owner_id,
        "conversation_id": str(conversation_id),
        "content": suggestion,
        "metadata": {"messages_count": len(result.data), "type": "reply_suggestion"},
    }).execute()

    if not insert_result.data:
        raise HTTPException(status_code=500, detail="Erro ao salvar sugestão")

    return SuggestResponse(
        suggestion_id=insert_result.data[0]["id"],
        content=suggestion,
        suggestion_type="reply_suggestion",
    )


@router.post("/conversation/{conversation_id}/summarize", response_model=SummaryResponse)
async def summarize_conversation(
    conversation_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """
    Gera resumo da conversa em português.
    Usa Gemini Pro para resumir contexto e status.
    """
    # Busca mensagens da conversa
    result = db.table("messages").select("*").eq(
        "conversation_id", str(conversation_id)
    ).order("sent_at", desc=False).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Conversa não encontrada ou vazia")

    # Monta contexto
    conversation_text = _build_conversation_text(result.data)

    # Busca prompt customizado do usuário
    custom_prompt = _get_user_prompt(db, owner_id, "summary")

    # Gera resumo
    gemini = get_gemini_service()
    try:
        summary = await gemini.summarize(conversation_text, custom_prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar resumo: {e}")

    # Salva no banco
    insert_result = db.table("ai_suggestions").insert({
        "owner_id": owner_id,
        "conversation_id": str(conversation_id),
        "suggestion_type": "summary",
        "content": summary,
        "metadata": {"messages_count": len(result.data)},
    }).execute()

    if not insert_result.data:
        raise HTTPException(status_code=500, detail="Erro ao salvar resumo")

    return SummaryResponse(
        suggestion_id=insert_result.data[0]["id"],
        content=summary,
        suggestion_type="summary",
    )


@router.post("/suggestion/{suggestion_id}/feedback", response_model=FeedbackResponse)
async def record_feedback(
    suggestion_id: UUID,
    request: FeedbackRequest,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """
    Registra feedback sobre uma sugestão de IA.
    Ações: accepted, rejected, edited.
    """
    if request.action not in ("accepted", "rejected", "edited"):
        raise HTTPException(status_code=400, detail="Ação inválida")

    # Verifica se sugestão existe
    check = db.table("ai_suggestions").select("id").eq(
        "id", str(suggestion_id)
    ).eq("owner_id", owner_id).execute()

    if not check.data:
        raise HTTPException(status_code=404, detail="Sugestão não encontrada")

    # Insere feedback
    result = db.table("ai_feedback").insert({
        "owner_id": owner_id,
        "suggestion_id": str(suggestion_id),
        "action": request.action,
        "final_content": request.final_content,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao salvar feedback")

    return FeedbackResponse(
        feedback_id=result.data[0]["id"],
        action=request.action,
    )


@router.get("/conversation/{conversation_id}/suggestions")
async def list_suggestions(
    conversation_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Lista sugestões anteriores de uma conversa."""
    result = db.table("ai_suggestions").select("*").eq(
        "conversation_id", str(conversation_id)
    ).eq("owner_id", owner_id).order("created_at", desc=True).limit(10).execute()

    return {"suggestions": result.data or []}
