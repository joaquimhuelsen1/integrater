"""
Serviço de transcrição de áudio usando Gemini.
"""

import os
import tempfile
import httpx
from google import genai

from ..config import get_settings

settings = get_settings()

# Cliente Gemini
client = genai.Client(api_key=settings.gemini_api_key)


async def transcribe_audio(audio_url: str, mime_type: str = "audio/ogg") -> str:
    """
    Transcreve áudio usando Gemini.

    Args:
        audio_url: URL assinada do áudio no storage
        mime_type: Tipo MIME do áudio

    Returns:
        Texto transcrito
    """
    # Baixa o áudio
    async with httpx.AsyncClient() as http:
        response = await http.get(audio_url, follow_redirects=True)
        response.raise_for_status()
        audio_data = response.content

    # Salva temporariamente
    suffix = ".ogg" if "ogg" in mime_type else ".mp3"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_data)
        temp_path = f.name

    try:
        # Upload para Gemini
        audio_file = client.files.upload(file=temp_path)

        # Transcreve com Gemini
        response = client.models.generate_content(
            model=settings.gemini_flash_model,
            contents=[
                audio_file,
                "Transcreva este áudio exatamente como falado. Retorne APENAS o texto transcrito, sem explicações ou formatação adicional. Se o áudio estiver vazio ou inaudível, retorne '[áudio inaudível]'."
            ]
        )

        transcription = response.text.strip()
        return transcription

    finally:
        # Limpa arquivo temporário
        if os.path.exists(temp_path):
            os.unlink(temp_path)
