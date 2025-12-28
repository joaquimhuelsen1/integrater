"""
Router de transcrição de áudio.
"""

from uuid import UUID
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from ..deps import get_supabase, get_owner_id
from ..services.transcriber import transcribe_audio
from ..services.translator import translate_text

router = APIRouter(prefix="/transcribe", tags=["transcribe"])


class TranscriptionResponse(BaseModel):
    attachment_id: str
    transcription: str
    message_id: str
    translated_transcription: Optional[str] = None


@router.post("/attachment/{attachment_id}", response_model=TranscriptionResponse)
async def transcribe_attachment(
    attachment_id: UUID,
    db=Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Transcreve um anexo de áudio."""
    # Busca o anexo
    result = db.table("attachments").select(
        "id, message_id, storage_bucket, storage_path, mime_type, metadata"
    ).eq("id", str(attachment_id)).eq("owner_id", owner_id).execute()

    if not result.data:
        raise HTTPException(404, "Anexo não encontrado")

    attachment = result.data[0]
    mime_type = attachment.get("mime_type", "")

    # Verifica se é áudio
    if not (mime_type.startswith("audio/") or mime_type == "application/ogg"):
        raise HTTPException(400, "Anexo não é um áudio")

    # Verifica se já tem transcrição em cache
    metadata = attachment.get("metadata") or {}
    if metadata.get("transcription"):
        return TranscriptionResponse(
            attachment_id=str(attachment_id),
            transcription=metadata["transcription"],
            message_id=attachment["message_id"],
            translated_transcription=metadata.get("translated_transcription"),
        )

    # Gera URL assinada para download
    bucket = attachment["storage_bucket"]
    path = attachment["storage_path"]

    signed = db.storage.from_(bucket).create_signed_url(path, 300)
    if not signed.get("signedURL"):
        raise HTTPException(500, "Erro ao gerar URL de download")

    audio_url = signed["signedURL"]

    # Transcreve
    try:
        transcription = await transcribe_audio(audio_url, mime_type)
    except Exception as e:
        raise HTTPException(500, f"Erro na transcrição: {str(e)}")

    # Traduz a transcrição para pt-BR
    translated = None
    try:
        result = await translate_text(transcription, "pt-BR")
        if result and result.get("translated_text"):
            translated = result["translated_text"]
    except Exception:
        pass  # Ignora erros de tradução

    # Salva no metadata do anexo
    metadata["transcription"] = transcription
    if translated:
        metadata["translated_transcription"] = translated
    db.table("attachments").update({"metadata": metadata}).eq(
        "id", str(attachment_id)
    ).execute()

    # Atualiza o texto da mensagem se estiver vazio
    msg_result = db.table("messages").select("text").eq(
        "id", attachment["message_id"]
    ).execute()

    if msg_result.data:
        msg = msg_result.data[0]
        if not msg.get("text") or msg["text"].strip() == "":
            db.table("messages").update({"text": f"[Áudio] {transcription}"}).eq(
                "id", attachment["message_id"]
            ).execute()

    return TranscriptionResponse(
        attachment_id=str(attachment_id),
        transcription=transcription,
        message_id=attachment["message_id"],
        translated_transcription=translated,
    )


@router.get("/attachment/{attachment_id}", response_model=TranscriptionResponse | None)
async def get_transcription(
    attachment_id: UUID,
    db=Depends(get_supabase),
    owner_id: str = Depends(get_owner_id),
):
    """Busca transcrição em cache."""
    result = db.table("attachments").select(
        "id, message_id, metadata"
    ).eq("id", str(attachment_id)).eq("owner_id", owner_id).execute()

    if not result.data:
        return None

    attachment = result.data[0]
    metadata = attachment.get("metadata") or {}

    if not metadata.get("transcription"):
        return None

    return TranscriptionResponse(
        attachment_id=str(attachment_id),
        transcription=metadata["transcription"],
        message_id=attachment["message_id"],
        translated_transcription=metadata.get("translated_transcription"),
    )
