"""
Router de Instrucoes - Gera instrucoes personalizadas via n8n + GLM.
Fire-and-forget: API dispara webhook n8n, n8n processa e salva resultado no Supabase.
"""

import os
import asyncio
import logging
from datetime import datetime, timezone

import io
import httpx
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field
from supabase import Client
from uuid import UUID
from docx import Document as DocxDocument
from pypdf import PdfReader

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


class ConfigCreateRequest(BaseModel):
    config_type: str = Field(..., pattern="^(system_prompt|knowledge_base)$")
    name: str = Field(default="default", max_length=255)
    content: str = Field(..., min_length=1)
    is_active: bool = True


class ConfigUpdateRequest(BaseModel):
    name: str | None = None
    content: str | None = None
    is_active: bool | None = None


# === Config Endpoints ===

@router.get("/configs")
async def list_configs(
    config_type: str | None = None,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Lista todas as configs de instrucoes (system_prompt e knowledge_base)."""
    query = db.table("instruction_configs").select(
        "id, config_type, name, is_active, created_at, updated_at"
    ).eq("owner_id", owner_id)

    if config_type:
        query = query.eq("config_type", config_type)

    result = query.order("config_type").order("name").execute()
    return {"configs": result.data}


@router.get("/configs/{config_id}")
async def get_config(
    config_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Retorna uma config com conteudo completo."""
    result = db.table("instruction_configs").select("*").eq(
        "id", str(config_id)
    ).eq("owner_id", owner_id).limit(1).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Config nao encontrada")

    return {"config": result.data[0]}


@router.post("/configs")
async def create_config(
    request: ConfigCreateRequest,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Cria uma nova config. Para system_prompt, desativa anteriores automaticamente."""
    # Se for system_prompt, desativar o anterior (so pode ter 1 ativo)
    if request.config_type == "system_prompt":
        db.table("instruction_configs").update(
            {"is_active": False}
        ).eq("owner_id", owner_id).eq(
            "config_type", "system_prompt"
        ).eq("is_active", True).execute()

    insert_data = {
        "owner_id": owner_id,
        "workspace_id": owner_id,
        "config_type": request.config_type,
        "name": request.name,
        "content": request.content,
        "is_active": request.is_active,
    }

    result = db.table("instruction_configs").insert(insert_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao criar config")

    return {"config": result.data[0]}


@router.put("/configs/{config_id}")
async def update_config(
    config_id: UUID,
    request: ConfigUpdateRequest,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Atualiza uma config existente."""
    update_data = {k: v for k, v in request.model_dump().items() if v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    result = db.table("instruction_configs").update(update_data).eq(
        "id", str(config_id)
    ).eq("owner_id", owner_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Config nao encontrada")

    return {"config": result.data[0]}


@router.delete("/configs/{config_id}")
async def delete_config(
    config_id: UUID,
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Deleta uma config."""
    result = db.table("instruction_configs").delete().eq(
        "id", str(config_id)
    ).eq("owner_id", owner_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Config nao encontrada")

    return {"deleted": True}


# === File Upload Helpers ===

ALLOWED_EXTENSIONS = {".docx", ".pdf", ".txt", ".md"}


def _extract_text_from_file(file_bytes: bytes, filename: str) -> str:
    """Extrai texto de .docx, .pdf, .txt ou .md."""
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Formato nao suportado: {ext}. Use: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    if ext == ".docx":
        doc = DocxDocument(io.BytesIO(file_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        content = "\n".join(paragraphs)

    elif ext == ".pdf":
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = [page.extract_text() or "" for page in reader.pages]
        content = "\n\n".join(pages)

    elif ext in (".txt", ".md"):
        content = file_bytes.decode("utf-8", errors="replace")

    else:
        raise HTTPException(status_code=400, detail=f"Formato nao suportado: {ext}")

    content = content.strip()
    if not content:
        raise HTTPException(status_code=400, detail=f"Arquivo '{filename}' esta vazio ou sem texto extraivel")

    return content


# === Upload Endpoints ===

@router.post("/configs/upload")
async def upload_config_file(
    file: UploadFile = File(...),
    config_type: str = Form("knowledge_base"),
    name: str = Form(None),
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Upload de arquivo (.docx, .pdf, .txt, .md) para criar config."""
    if config_type not in ("system_prompt", "knowledge_base"):
        raise HTTPException(status_code=400, detail="config_type deve ser system_prompt ou knowledge_base")

    file_bytes = await file.read()
    filename = file.filename or "unknown.txt"
    content = _extract_text_from_file(file_bytes, filename)

    # Nome: usa fornecido ou filename sem extensao
    config_name = name or Path(filename).stem

    # Se system_prompt, desativar anteriores
    if config_type == "system_prompt":
        db.table("instruction_configs").update(
            {"is_active": False}
        ).eq("owner_id", owner_id).eq(
            "config_type", "system_prompt"
        ).eq("is_active", True).execute()

    insert_data = {
        "owner_id": owner_id,
        "workspace_id": owner_id,
        "config_type": config_type,
        "name": config_name,
        "content": content,
        "is_active": True,
    }

    result = db.table("instruction_configs").insert(insert_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Erro ao salvar config")

    logger.info(f"Config uploaded: {config_name} ({len(content)} chars) from {filename}")

    return {
        "config": result.data[0],
        "filename": filename,
        "chars_extracted": len(content),
    }


@router.post("/configs/upload-batch")
async def upload_config_files(
    files: list[UploadFile] = File(...),
    config_type: str = Form("knowledge_base"),
    db: Client = Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Upload de multiplos arquivos de uma vez. Cada arquivo vira uma config separada."""
    if config_type not in ("system_prompt", "knowledge_base"):
        raise HTTPException(status_code=400, detail="config_type deve ser system_prompt ou knowledge_base")

    results = []
    errors = []

    for file in files:
        try:
            file_bytes = await file.read()
            filename = file.filename or "unknown.txt"
            content = _extract_text_from_file(file_bytes, filename)
            config_name = Path(filename).stem

            insert_data = {
                "owner_id": owner_id,
                "workspace_id": owner_id,
                "config_type": config_type,
                "name": config_name,
                "content": content,
                "is_active": True,
            }

            result = db.table("instruction_configs").insert(insert_data).execute()

            if result.data:
                results.append({
                    "config": result.data[0],
                    "filename": filename,
                    "chars_extracted": len(content),
                })
            else:
                errors.append({"filename": filename, "error": "Erro ao salvar"})

        except HTTPException as e:
            errors.append({"filename": file.filename or "unknown", "error": e.detail})
        except Exception as e:
            errors.append({"filename": file.filename or "unknown", "error": str(e)})

    logger.info(f"Batch upload: {len(results)} ok, {len(errors)} errors")

    return {
        "uploaded": results,
        "errors": errors,
        "total": len(files),
        "success": len(results),
        "failed": len(errors),
    }


# === Instruction Endpoints ===

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
