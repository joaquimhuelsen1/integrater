"""
Router de Instrucoes - Gera instrucoes personalizadas via n8n + GLM.
Fire-and-forget: API dispara webhook n8n, n8n processa e salva resultado no Supabase.
"""

import os
import asyncio
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from supabase import Client
from uuid import UUID

from ..deps import get_supabase, get_owner_id
from .ai import _build_conversation_text


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/instructions", tags=["instructions"])


# === Models ===

class GenerateInstructionsRequest(BaseModel):
    form_data: str = Field(..., min_length=10, description="Dados do formulario do aluno")


class InstructionResponse(BaseModel):
    id: str
    conversation_id: str
    form_data: str
    conversation_text: str
    instructions: str | None = None
    status: str
    model_used: str | None = None
    error_message: str | None = None
    created_at: str
    updated_at: str


# === Endpoints ===

@router.post("/conversations/{conversation_id}/generate")
async def generate_instructions(
    conversation_id: UUID,
    request: GenerateInstructionsRequest,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """
    Gera instrucoes personalizadas para uma conversa.
    Insere registro pending e dispara n8n webhook (fire-and-forget).
    """
    # Verificar se ja existe geracao em andamento
    existing = db.table("conversation_instructions").select("id, status").eq(
        "conversation_id", str(conversation_id)
    ).eq("owner_id", owner_id).in_(
        "status", ["pending", "generating"]
    ).limit(1).execute()

    if existing.data:
        raise HTTPException(
            status_code=409,
            detail="Ja existe uma geracao em andamento para esta conversa"
        )

    # Buscar mensagens da conversa
    messages_result = db.table("messages").select(
        "direction, text, sent_at"
    ).eq(
        "conversation_id", str(conversation_id)
    ).is_("deleted_at", "null").order("sent_at", desc=False).execute()

    if not messages_result.data:
        raise HTTPException(status_code=400, detail="Conversa sem mensagens")

    conversation_text = _build_conversation_text(messages_result.data)

    # Buscar conversa com validacao de owner + contact name (query unica)
    conv_result = db.table("conversations").select(
        "owner_id, contact:contacts(display_name)"
    ).eq("id", str(conversation_id)).eq("owner_id", owner_id).limit(1).execute()

    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversa nao encontrada")

    contact_name = None
    if conv_result.data[0].get("contact"):
        contact_name = conv_result.data[0]["contact"].get("display_name")

    # Inserir registro com status pending
    insert_data = {
        "owner_id": owner_id,
        "workspace_id": owner_id,  # single-user mode
        "conversation_id": str(conversation_id),
        "form_data": request.form_data,
        "conversation_text": conversation_text,
        "status": "pending",
        "generation_started_at": datetime.now(timezone.utc).isoformat(),
    }

    insert_result = db.table("conversation_instructions").insert(insert_data).execute()

    if not insert_result.data:
        raise HTTPException(status_code=500, detail="Erro ao criar registro de instrucoes")

    instruction = insert_result.data[0]

    # Fire-and-forget: disparar n8n webhook
    n8n_url = os.environ.get("N8N_INSTRUCTIONS_WEBHOOK_URL")
    if n8n_url:
        async def _trigger_n8n():
            try:
                async with httpx.AsyncClient() as client:
                    await client.post(
                        n8n_url,
                        json={
                            "instruction_id": instruction["id"],
                            "conversation_id": str(conversation_id),
                            "form_data": request.form_data,
                            "conversation_text": conversation_text,
                            "contact_name": contact_name,
                            "owner_id": owner_id,
                        },
                        timeout=10.0,
                    )
                logger.info(f"n8n instructions webhook triggered for {instruction['id']}")
            except Exception as e:
                logger.warning(f"Failed to trigger n8n instructions for {instruction['id']}: {e}")

        asyncio.create_task(_trigger_n8n())
    else:
        logger.warning("N8N_INSTRUCTIONS_WEBHOOK_URL not configured")
        # Marcar como erro se webhook nao configurado
        db.table("conversation_instructions").update({
            "status": "error",
            "error_message": "Webhook de instrucoes nao configurado",
        }).eq("id", instruction["id"]).execute()

    return {
        "id": instruction["id"],
        "status": "pending",
        "message": "Geracao de instrucoes iniciada",
    }


@router.get("/conversations/{conversation_id}")
async def get_instructions(
    conversation_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """
    Retorna a instrucao mais recente de uma conversa.
    Usado para polling do frontend e para carregar instrucoes existentes.
    """
    result = db.table("conversation_instructions").select("*").eq(
        "conversation_id", str(conversation_id)
    ).eq("owner_id", owner_id).order(
        "created_at", desc=True
    ).limit(1).execute()

    if not result.data:
        return {"instruction": None}

    return {"instruction": result.data[0]}
