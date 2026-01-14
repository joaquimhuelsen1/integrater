"""
Router para Planos de Relacionamento com IA.

Endpoints:
- POST /plans/generate - Gera novo plano com contexto conversacional
- GET /plans - Lista planos do usuario
- GET /plans/{plan_id} - Detalhes de um plano
- DELETE /plans/{plan_id} - Remove um plano
- GET /plans/{plan_id}/conversation - Historico da conversa
- POST /plans/{plan_id}/continue - Continua conversa com GLM
- POST /plans/{plan_id}/refine - Refina bloco especifico
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from supabase import Client

from app.deps import get_supabase, get_current_user_id
from app.models import (
    CreatePlanRequest,
    PlanResponse,
    PlanListResponse,
    PlanStatus,
    PlanConversationListResponse,
    PlanConversationContinueRequest,
    PlanConversationContinueResponse,
    PlanRefineBlockRequest,
    PlanRefineBlockResponse,
)
from app.services.plan_generator import get_plan_generator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plans", tags=["plans"])


# ============================================================
# Helpers
# ============================================================

class GeneratePlanRequest(BaseModel):
    """Request para gerar novo plano."""
    form_data: dict = Field(default_factory=dict, description="Respostas do formulario")
    conversation_context: str | None = Field(None, description="Contexto adicional")


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


def _verify_plan_ownership(db: Client, plan_id: str, owner_id: UUID) -> dict:
    """Verifica se o plano pertence ao usuario e retorna os dados."""
    result = (
        db.table("relationship_plans")
        .select("*")
        .eq("id", str(plan_id))
        .eq("owner_id", str(owner_id))
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    return result.data


async def _run_generation_async(
    plan_id: str,
    form_data: dict,
    conversation_context: str | None,
    owner_id: str,
    workspace_id: str,
):
    """Executa geracao em background usando fluxo conversacional."""
    from app.deps import get_supabase
    from app.services.conversation_flow import ConversationFlowGenerator

    db = get_supabase()
    generator = ConversationFlowGenerator()

    try:
        # Atualizar status para generating
        db.table("relationship_plans").update({
            "status": "generating_structure",
            "generation_started_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", plan_id).execute()

        # Gerar plano via fluxo conversacional
        results = await generator.generate_full_plan_conversational(
            form_data=form_data,
            conversation_context=conversation_context or ""
        )

        # Salvar resultado
        db.table("relationship_plans").update({
            "status": "completed",
            "generation_completed_at": datetime.now(timezone.utc).isoformat(),
            "introduction": results.get("introducao", ""),
            "deepened_blocks": results.get("blocos", []),
            "summary": results.get("conclusao", ""),
            "faq": results.get("faq", ""),
            "structure": {
                "markdown_content": results.get("plano_completo_markdown", ""),
                "response_prompt1": results.get("response_prompt1", ""),
                "response_conversa": results.get("response_conversa", ""),
                "blocos_info": results.get("blocos_info", "")
            }
        }).eq("id", plan_id).execute()

        logger.info(f"Plan {plan_id}: geracao conversacional concluida")

    except Exception as e:
        logger.error(f"Erro na geracao do plano {plan_id}: {e}")
        db.table("relationship_plans").update({
            "status": "error",
            "error_message": str(e)
        }).eq("id", plan_id).execute()


# ============================================================
# CRUD Basico
# ============================================================

@router.get("", response_model=PlanListResponse)
async def list_plans(
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
    limit: int = 50,
    offset: int = 0,
    status: str | None = None,
):
    """Lista planos do usuario."""
    query = (
        db.table("relationship_plans")
        .select("*")
        .eq("owner_id", str(owner_id))
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if status:
        query = query.eq("status", status)

    result = query.execute()

    # Count total
    count_result = (
        db.table("relationship_plans")
        .select("id")
        .eq("owner_id", str(owner_id))
        .execute()
    )
    total = len(count_result.data) if count_result.data else 0

    return PlanListResponse(plans=result.data or [], total=total)


@router.post("/generate", response_model=PlanResponse, status_code=201)
async def generate_plan(
    data: GeneratePlanRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Gera novo plano de relacionamento.

    Cria o plano com status 'draft' e inicia geracao em background.
    O historico da conversa com GLM e salvo automaticamente.
    """
    workspace_id = _get_workspace_id(db, owner_id)

    # Criar plano com status draft
    plan_data = {
        "owner_id": str(owner_id),
        "workspace_id": workspace_id,
        "form_data": data.form_data,
        "conversation_context": data.conversation_context,
        "status": "draft",
    }

    result = db.table("relationship_plans").insert(plan_data).execute()
    plan = result.data[0]
    plan_id = plan["id"]

    # Iniciar geracao em background
    asyncio.create_task(_run_generation_async(
        plan_id,
        data.form_data,
        data.conversation_context,
        str(owner_id),
        workspace_id,
    ))

    logger.info(f"Plan {plan_id}: geracao iniciada")
    return plan


@router.get("/{plan_id}", response_model=PlanResponse)
async def get_plan(
    plan_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna detalhes de um plano."""
    plan = _verify_plan_ownership(db, str(plan_id), owner_id)
    return plan


@router.get("/{plan_id}/status", response_model=PlanStatus)
async def get_plan_status(
    plan_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Retorna status atual de geracao do plano."""
    plan = _verify_plan_ownership(db, str(plan_id), owner_id)
    return PlanStatus(
        status=plan.get("status"),
        error_message=plan.get("error_message"),
        generation_started_at=plan.get("generation_started_at"),
    )


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """Remove um plano (CASCADE remove historico de conversa)."""
    result = (
        db.table("relationship_plans")
        .delete()
        .eq("id", str(plan_id))
        .eq("owner_id", str(owner_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Plano não encontrado")


# ============================================================
# Conversational Context
# ============================================================

@router.get("/{plan_id}/conversation", response_model=PlanConversationListResponse)
async def get_plan_conversation(
    plan_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
    step: str | None = None,
):
    """
    Retorna historico da conversa com GLM.

    Opcionalmente filtra por etapa (structure, intro, block_1, etc).
    """
    _verify_plan_ownership(db, str(plan_id), owner_id)

    query = (
        db.table("plan_conversation_history")
        .select("*")
        .eq("plan_id", str(plan_id))
        .order("created_at", desc=False)
    )

    if step:
        query = query.eq("step", step)

    result = query.execute()
    messages = result.data or []

    return PlanConversationListResponse(messages=messages, total=len(messages))


@router.post("/{plan_id}/continue", response_model=PlanConversationContinueResponse)
async def continue_plan_conversation(
    plan_id: UUID,
    data: PlanConversationContinueRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Continua conversa com GLM mantendo contexto.

    Envia nova mensagem para a IA, retornando a resposta.
    O historico completo e mantido para refinamentos futuros.
    """
    plan = _verify_plan_ownership(db, str(plan_id), owner_id)

    if plan.get("status") not in ("completed", "error"):
        raise HTTPException(
            status_code=400,
            detail="Só é possível continuar conversa de planos completos ou com erro",
        )

    workspace_id = plan["workspace_id"]
    generator = get_plan_generator(db, str(owner_id), workspace_id)

    # Salvar mensagem do usuario
    user_msg_data = {
        "plan_id": str(plan_id),
        "role": "user",
        "content": data.message,
        "step": data.step,
        "block_id": data.block_id,
    }
    user_msg_result = db.table("plan_conversation_history").insert(user_msg_data).execute()
    user_msg = user_msg_result.data[0]

    # Buscar historico completo
    history_result = (
        db.table("plan_conversation_history")
        .select("*")
        .eq("plan_id", str(plan_id))
        .order("created_at", desc=False)
        .execute()
    )

    # Converter historico para formato GLM
    messages_for_glm = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in history_result.data
    ]

    # Chamar GLM com historico
    try:
        from app.services.glm import get_glm_service
        glm = get_glm_service()

        response_text = await glm._generate_with_history(messages_for_glm)

        # Salvar resposta do assistente
        assistant_msg_data = {
            "plan_id": str(plan_id),
            "role": "assistant",
            "content": response_text,
            "step": data.step,
            "block_id": data.block_id,
        }
        assistant_msg_result = (
            db.table("plan_conversation_history")
            .insert(assistant_msg_data)
            .execute()
        )
        assistant_msg = assistant_msg_result.data[0]

        return PlanConversationContinueResponse(
            message=user_msg,
            response=assistant_msg,
            suggestions=[],
        )

    except Exception as e:
        logger.error(f"Erro ao continuar conversa do plano {plan_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao continuar conversa: {e}")


@router.post("/{plan_id}/refine", response_model=PlanRefineBlockResponse)
async def refine_plan_block(
    plan_id: UUID,
    data: PlanRefineBlockRequest,
    db: Client = Depends(get_supabase),
    owner_id: UUID = Depends(get_current_user_id),
):
    """
    Refina um bloco específico do plano mantendo contexto.

    Usa o historico da conversa para refinar apenas o bloco selecionado.
    """
    plan = _verify_plan_ownership(db, str(plan_id), owner_id)

    deepened_blocks = plan.get("deepened_blocks", {})
    if data.block_id not in deepened_blocks:
        raise HTTPException(
            status_code=404,
            detail=f"Bloco {data.block_id} não encontrado no plano",
        )

    previous_content = deepened_blocks[data.block_id]

    # Buscar historico completo
    history_result = (
        db.table("plan_conversation_history")
        .select("*")
        .eq("plan_id", str(plan_id))
        .order("created_at", desc=False)
        .execute()
    )

    # Construir prompt de refinamento
    block_data = previous_content
    if "phase" in block_data:
        block_data = {"title": block_data["phase"].get("title", ""), "phase": block_data["phase"]}

    refine_prompt = f"""Refine o seguinte bloco do plano conforme a instrucao:

Bloco atual:
{block_data}

Instrucao: {data.instruction}

Retorne APENAS JSON valido com o mesmo formato do bloco original, mas com as refinamentos solicitados."""

    # Preparar mensagens para GLM
    messages = [
        {"role": "system", "content": "Voce é um consultor de vendas especialista."},
    ]

    # Adicionar historico relevante (mensagens anteriores)
    for msg in history_result.data[-20:]:  # Ultimas 20 mensagens
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Adicionar prompt de refinamento
    messages.append({"role": "user", "content": refine_prompt})

    try:
        from app.services.glm import get_glm_service, _parse_json_response
        glm = get_glm_service()

        response = await glm._generate_with_history(messages)
        refined_content = _parse_json_response(response)

        # Salvar mensagens no historico
        user_msg_data = {
            "plan_id": str(plan_id),
            "role": "user",
            "content": refine_prompt,
            "step": "block_refine",
            "block_id": data.block_id,
        }
        user_msg_result = db.table("plan_conversation_history").insert(user_msg_data).execute()

        assistant_msg_data = {
            "plan_id": str(plan_id),
            "role": "assistant",
            "content": response,
            "step": "block_refine",
            "block_id": data.block_id,
        }
        assistant_msg_result = (
            db.table("plan_conversation_history")
            .insert(assistant_msg_data)
            .execute()
        )

        # Atualizar bloco no plano
        deepened_blocks[data.block_id] = {
            "phase": previous_content.get("phase", {}),
            "details": refined_content,
        }
        db.table("relationship_plans").update(
            {"deepened_blocks": deepened_blocks}
        ).eq("id", str(plan_id)).execute()

        return PlanRefineBlockResponse(
            block_id=data.block_id,
            previous_content=previous_content,
            refined_content=refined_content,
            messages_added=[
                user_msg_result.data[0],
                assistant_msg_result.data[0],
            ],
        )

    except Exception as e:
        logger.error(f"Erro ao refinar bloco {data.block_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao refinar bloco: {e}")
