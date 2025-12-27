"""
Serviço de integração com Gemini API.
- Tradução EN→PT (Gemini 3 Flash)
- Sugestão de resposta (Gemini 3 Pro)
- Resumo de conversa (Gemini 3 Pro)

Usa o novo SDK google-genai (substitui google-generativeai depreciado).
"""

import asyncio
from google import genai
from ..config import get_settings


settings = get_settings()


# Prompts padrão
DEFAULT_PROMPTS = {
    "language_detection": """Detect the language of the following text.
Reply with ONLY the ISO 639-1 language code (e.g., 'en', 'pt', 'es', 'fr').
If unsure, reply 'unknown'.

Text: {text}""",

    "translation": """Translate the following text to Brazilian Portuguese (pt-BR).

Rules:
- Preserve links, numbers, proper names, emails exactly as they are
- Do NOT explain or add context - just translate
- Keep the same tone and style
- If the text is already in Portuguese, return it unchanged

Text to translate:
{text}""",

    "reply_suggestion": """You are an expert sales assistant helping respond to leads.
Based on the conversation history below, suggest a helpful response in English.

Rules:
- Be professional but friendly
- Be concise and direct
- Address the lead's specific questions/concerns
- If appropriate, guide towards next steps

Conversation:
{conversation}

Suggest a response:""",

    "summary": """Summarize the following conversation in Brazilian Portuguese.
Focus on:
- Main topic/intent of the conversation
- Key information exchanged
- Current status (open question, waiting for response, resolved, etc.)
- Any action items

Keep it concise (2-4 sentences max).

Conversation:
{conversation}

Summary in Portuguese:""",

    "draft_translation": """Translate this Portuguese text to English. Output ONLY the translation, nothing else.

{text}""",
}


class GeminiService:
    def __init__(self):
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.flash_model = settings.gemini_flash_model
        self.pro_model = settings.gemini_pro_model

    def _generate_sync(self, model: str, prompt: str) -> str:
        """Chamada síncrona ao Gemini."""
        response = self.client.models.generate_content(
            model=model,
            contents=prompt
        )
        return response.text

    async def _generate(self, model: str, prompt: str) -> str:
        """Chamada assíncrona ao Gemini (via thread pool)."""
        return await asyncio.to_thread(self._generate_sync, model, prompt)

    async def generate_with_model(self, model_id: str, prompt: str) -> str:
        """Gera resposta usando modelo específico."""
        return await asyncio.to_thread(self._generate_sync, model_id, prompt)

    async def detect_language(self, text: str) -> str:
        """Detecta o idioma do texto."""
        if not text or len(text.strip()) < 3:
            return "unknown"

        prompt = DEFAULT_PROMPTS["language_detection"].format(text=text[:500])

        try:
            result = await self._generate(self.flash_model, prompt)
            lang = result.strip().lower()[:10]
            # Limpa resposta
            lang = lang.replace("'", "").replace('"', "").strip()
            return lang if len(lang) <= 5 else "unknown"
        except Exception as e:
            print(f"Erro ao detectar idioma: {e}")
            return "unknown"

    async def translate(
        self,
        text: str,
        source_lang: str | None = None,
        target_lang: str = "pt-BR"
    ) -> tuple[str, str | None]:
        """
        Traduz texto para o idioma alvo.
        Retorna (texto_traduzido, idioma_fonte).
        """
        if not text or len(text.strip()) < 2:
            return text, None

        # Traduz direto sem detectar idioma (Gemini detecta automaticamente)
        prompt = DEFAULT_PROMPTS["translation"].format(text=text)

        try:
            translated = await self._generate(self.flash_model, prompt)
            translated = translated.strip()

            # Se retornou igual, provavelmente já era português
            if translated == text.strip():
                return text, "pt"

            return translated, source_lang or "auto"
        except Exception as e:
            print(f"Erro ao traduzir: {e}")
            raise

    async def suggest_reply(
        self,
        conversation_text: str,
        custom_prompt: str | None = None,
        model_id: str | None = None
    ) -> str:
        """Sugere resposta em inglês para a conversa."""
        template = custom_prompt or DEFAULT_PROMPTS["reply_suggestion"]
        prompt = template.replace("{conversation}", conversation_text)
        model = model_id or self.pro_model

        try:
            result = await self._generate(model, prompt)
            return result.strip()
        except Exception as e:
            print(f"Erro ao sugerir resposta: {e}")
            raise

    async def summarize(
        self,
        conversation_text: str,
        custom_prompt: str | None = None,
        model_id: str | None = None
    ) -> str:
        """Resume a conversa em português."""
        template = custom_prompt or DEFAULT_PROMPTS["summary"]
        prompt = template.replace("{conversation}", conversation_text)
        model = model_id or self.pro_model

        try:
            result = await self._generate(model, prompt)
            return result.strip()
        except Exception as e:
            print(f"Erro ao resumir: {e}")
            raise

    async def translate_draft(
        self,
        text: str,
        custom_prompt: str | None = None,
        model_id: str | None = None
    ) -> str:
        """Traduz rascunho PT→EN, preservando quebras de linha."""
        if not text or len(text.strip()) < 2:
            return text

        # Normalizar quebras de linha
        text = text.replace("\r\n", "\n")

        # Separar por quebras de linha duplas (parágrafos)
        paragraphs = text.split("\n\n")

        template = custom_prompt or DEFAULT_PROMPTS["draft_translation"]
        model = model_id or self.pro_model

        translated_paragraphs = []

        for paragraph in paragraphs:
            if not paragraph.strip():
                translated_paragraphs.append("")
                continue

            # Separar por quebras de linha simples
            lines = paragraph.split("\n")
            translated_lines = []

            for line in lines:
                if not line.strip():
                    translated_lines.append("")
                    continue

                prompt = template.replace("{text}", line)
                try:
                    result = await self._generate(model, prompt)
                    translated_lines.append(result.strip())
                except Exception as e:
                    print(f"Erro ao traduzir linha: {e}")
                    translated_lines.append(line)  # Mantém original se falhar

            translated_paragraphs.append("\n".join(translated_lines))

        return "\n\n".join(translated_paragraphs)


# Singleton
_gemini_service: GeminiService | None = None


def get_gemini_service() -> GeminiService:
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiService()
    return _gemini_service
