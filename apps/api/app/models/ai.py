from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from .base import BaseSchema
from .enums import AISuggestionType, AIFeedbackAction, PromptType


# ============================================
# AI Suggestion
# ============================================
class SuggestReplyRequest(BaseModel):
    conversation_id: UUID


class SuggestReplyResponse(BaseModel):
    suggestion_id: UUID
    content: str
    model: str


class SummarizeRequest(BaseModel):
    conversation_id: UUID


class SummarizeResponse(BaseModel):
    summary_id: UUID
    content: str
    model: str


class AIFeedbackRequest(BaseModel):
    suggestion_id: UUID
    action: AIFeedbackAction
    final_content: str | None = None


class AISuggestion(BaseSchema):
    id: UUID
    owner_id: UUID
    conversation_id: UUID
    message_id: UUID | None
    type: AISuggestionType
    model: str | None
    prompt_version: str | None
    content: str
    metadata: dict = {}
    created_at: datetime


class AIFeedback(BaseSchema):
    id: UUID
    owner_id: UUID
    suggestion_id: UUID
    action: AIFeedbackAction
    final_content: str | None
    created_at: datetime


class ConversationSummary(BaseSchema):
    id: UUID
    owner_id: UUID
    conversation_id: UUID
    model: str | None
    summary: str
    metadata: dict = {}
    created_at: datetime


# ============================================
# Prompts
# ============================================
class PromptBase(BaseModel):
    content: str
    description: str | None = None


class PromptUpdate(PromptBase):
    pass


class Prompt(PromptBase, BaseSchema):
    id: UUID
    owner_id: UUID
    type: PromptType
    version: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PromptVersionList(BaseModel):
    versions: list[Prompt]
