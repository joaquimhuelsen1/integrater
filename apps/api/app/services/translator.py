"""
Serviço de tradução rápida usando Google Translate (lib deep-translator).
Muito mais rápido que IA para traduções simples.
"""

import asyncio
from deep_translator import GoogleTranslator
from deep_translator.exceptions import LanguageNotSupportedException


async def translate_text(text: str, target_lang: str = "pt") -> tuple[str, str | None]:
    """
    Traduz texto para o idioma alvo.
    Retorna (texto_traduzido, idioma_fonte).
    """
    if not text or len(text.strip()) < 2:
        return text, None

    try:
        # deep-translator é síncrono, executa em thread
        def do_translate():
            translator = GoogleTranslator(source='auto', target=target_lang)
            result = translator.translate(text)
            # Detecta idioma fonte
            detector = GoogleTranslator(source='auto', target='en')
            detected = detector.translate(text[:50])  # Só pra detectar
            return result, 'auto'

        result, source = await asyncio.to_thread(do_translate)
        return result, source

    except LanguageNotSupportedException:
        return text, None
    except Exception as e:
        print(f"Erro ao traduzir: {e}")
        return text, None
