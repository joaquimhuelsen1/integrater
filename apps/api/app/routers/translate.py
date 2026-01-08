"""
Router de tradução - Endpoints para traduzir mensagens e conversas.
"""

from uuid import UUID
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from ..deps import get_supabase, get_owner_id
from ..models.translations import (
    TranslateMessageRequest,
    TranslateMessageResponse,
    TranslateConversationRequest,
    TranslateConversationResponse,
    TranslationItem,
)
from ..services.translator import translate_text

router = APIRouter(prefix="/translate", tags=["translate"])


class TranslateDraftRequest(BaseModel):
    """Request para traduzir rascunho."""
    text: str
    target_lang: str = "en"


class TranslateDraftResponse(BaseModel):
    """Response da tradução de rascunho."""
    translated_text: str
    source_lang: str = "pt"
    target_lang: str = "en"


@router.post("/message/{message_id}", response_model=TranslateMessageResponse)
async def translate_message(
    message_id: UUID,
    req: TranslateMessageRequest = None,
    db=Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Traduz uma mensagem individual."""
    if req is None:
        req = TranslateMessageRequest()

    # Busca mensagem
    msg_result = db.table("messages").select("id, text, owner_id").eq(
        "id", str(message_id)
    ).eq("owner_id", owner_id).execute()

    if not msg_result.data:
        raise HTTPException(404, "Mensagem não encontrada")

    message = msg_result.data[0]
    text = message.get("text")

    if not text or len(text.strip()) < 2:
        raise HTTPException(400, "Mensagem sem texto para traduzir")

    # Verifica cache
    cache_result = db.table("message_translations").select("*").eq(
        "message_id", str(message_id)
    ).eq("target_lang", req.target_lang).execute()

    if cache_result.data:
        cached = cache_result.data[0]
        return TranslateMessageResponse(
            translation_id=cached["id"],
            source_lang=cached["source_lang"],
            target_lang=cached["target_lang"],
            translated_text=cached["translated_text"],
        )

    # Traduz via Google Translate (lib)
    target = req.target_lang.split("-")[0]  # pt-BR -> pt
    translated_text, source_lang = await translate_text(text, target)

    # Salva no cache
    insert_result = db.table("message_translations").insert({
        "owner_id": owner_id,
        "message_id": str(message_id),
        "source_lang": source_lang,
        "target_lang": req.target_lang,
        "provider": "googletrans",
        "model": None,
        "translated_text": translated_text,
    }).execute()

    translation = insert_result.data[0]

    return TranslateMessageResponse(
        translation_id=translation["id"],
        source_lang=source_lang,
        target_lang=req.target_lang,
        translated_text=translated_text,
    )


@router.get("/message/{message_id}", response_model=TranslateMessageResponse | None)
async def get_translation(
    message_id: UUID,
    target_lang: str = "pt-BR",
    db=Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Busca tradução em cache (não traduz se não existir)."""
    result = db.table("message_translations").select("*").eq(
        "message_id", str(message_id)
    ).eq("target_lang", target_lang).eq("owner_id", owner_id).execute()

    if not result.data:
        return None

    cached = result.data[0]
    return TranslateMessageResponse(
        translation_id=cached["id"],
        source_lang=cached["source_lang"],
        target_lang=cached["target_lang"],
        translated_text=cached["translated_text"],
    )


@router.get("/conversation/{conversation_id}/cache", response_model=TranslateConversationResponse)
async def get_conversation_translations_cache(
    conversation_id: UUID,
    target_lang: str = "pt-BR",
    db=Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Busca traduções em cache da conversa (não traduz)."""
    # Busca mensagens da conversa
    msgs_result = db.table("messages").select("id").eq(
        "conversation_id", str(conversation_id)
    ).eq("owner_id", owner_id).execute()

    if not msgs_result.data:
        return TranslateConversationResponse(translated_count=0, skipped_count=0)

    msg_ids = [m["id"] for m in msgs_result.data]

    # Busca traduções existentes
    translations_result = db.table("message_translations").select(
        "message_id, translated_text, source_lang"
    ).in_("message_id", msg_ids).eq("target_lang", target_lang).execute()

    translations = [
        TranslationItem(
            message_id=t["message_id"],
            translated_text=t["translated_text"],
            source_lang=t["source_lang"],
        )
        for t in translations_result.data
    ]

    return TranslateConversationResponse(
        translated_count=len(translations),
        skipped_count=0,
        translations=translations,
    )


@router.post("/conversation/{conversation_id}", response_model=TranslateConversationResponse)
async def translate_conversation(
    conversation_id: UUID,
    req: TranslateConversationRequest = None,
    db=Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Traduz todas as mensagens de uma conversa (batch)."""
    if req is None:
        req = TranslateConversationRequest()

    # Verifica se conversa existe
    conv_result = db.table("conversations").select("id").eq(
        "id", str(conversation_id)
    ).eq("owner_id", owner_id).execute()

    if not conv_result.data:
        raise HTTPException(404, "Conversa não encontrada")

    # Busca mensagens da conversa
    msgs_result = db.table("messages").select("id, text").eq(
        "conversation_id", str(conversation_id)
    ).eq("owner_id", owner_id).not_.is_("text", "null").execute()

    if not msgs_result.data:
        return TranslateConversationResponse(translated_count=0, skipped_count=0)

    # Busca traduções existentes
    msg_ids = [m["id"] for m in msgs_result.data]
    existing_result = db.table("message_translations").select("message_id").in_(
        "message_id", msg_ids
    ).eq("target_lang", req.target_lang).execute()

    existing_ids = {t["message_id"] for t in existing_result.data}

    # Filtra mensagens que precisam tradução
    to_translate = [
        m for m in msgs_result.data
        if m["id"] not in existing_ids and m.get("text") and len(m["text"].strip()) >= 2
    ]

    translated_count = 0
    skipped_count = len(existing_ids)
    target = req.target_lang.split("-")[0]  # pt-BR -> pt

    for msg in to_translate:
        try:
            translated_text, source_lang = await translate_text(msg["text"], target)

            # Se já está em português, pula
            if source_lang and source_lang.startswith("pt"):
                skipped_count += 1
                continue

            db.table("message_translations").insert({
                "owner_id": owner_id,
                "message_id": msg["id"],
                "source_lang": source_lang,
                "target_lang": req.target_lang,
                "provider": "googletrans",
                "model": None,
                "translated_text": translated_text,
            }).execute()

            translated_count += 1

        except Exception as e:
            print(f"Erro ao traduzir mensagem {msg['id']}: {e}")
            continue

    # Busca TODAS as traduções (novas + existentes) para retornar
    all_translations_result = db.table("message_translations").select(
        "message_id, translated_text, source_lang"
    ).in_("message_id", msg_ids).eq("target_lang", req.target_lang).execute()

    translations = [
        TranslationItem(
            message_id=t["message_id"],
            translated_text=t["translated_text"],
            source_lang=t["source_lang"],
        )
        for t in all_translations_result.data
    ]

    return TranslateConversationResponse(
        translated_count=translated_count,
        skipped_count=skipped_count,
        translations=translations,
    )


@router.post("/draft", response_model=TranslateDraftResponse)
async def translate_draft(
    req: TranslateDraftRequest,
    db=Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Traduz rascunho PT→EN usando Google Translate (instantâneo ~100ms)."""
    if not req.text or len(req.text.strip()) < 2:
        raise HTTPException(400, "Texto muito curto")

    # Usa Google Translate direto - muito mais rápido que LLM
    try:
        translated, _ = await translate_text(req.text, req.target_lang.split("-")[0])
        return TranslateDraftResponse(
            translated_text=translated,
            source_lang="pt",
            target_lang=req.target_lang,
        )
    except Exception as e:
        raise HTTPException(500, f"Erro ao traduzir: {e}")
