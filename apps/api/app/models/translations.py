from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from .base import BaseSchema, TimestampMixin


# ============================================
# Message Translation
# ============================================
class TranslateMessageRequest(BaseModel):
    target_lang: str = "pt-BR"


class TranslateConversationRequest(BaseModel):
    target_lang: str = "pt-BR"


class MessageTranslation(TimestampMixin, BaseSchema):
    id: UUID
    owner_id: UUID
    message_id: UUID
    source_lang: str | None
    target_lang: str
    provider: str
    model: str | None
    translated_text: str
    metadata: dict = {}


class TranslateMessageResponse(BaseModel):
    translation_id: UUID
    source_lang: str | None
    target_lang: str
    translated_text: str


class TranslationItem(BaseModel):
    message_id: str
    translated_text: str
    source_lang: str | None


class TranslateConversationResponse(BaseModel):
    translated_count: int
    skipped_count: int
    translations: list[TranslationItem] = []
