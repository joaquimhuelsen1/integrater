from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from .base import BaseSchema, TimestampMixin


# ============================================
# Tag
# ============================================
class TagBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    color: str | None = None


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=60)
    color: str | None = None


class Tag(TagBase, TimestampMixin, BaseSchema):
    id: UUID
    owner_id: UUID


# ============================================
# Conversation Tag
# ============================================
class AddTagRequest(BaseModel):
    tag_id: UUID
