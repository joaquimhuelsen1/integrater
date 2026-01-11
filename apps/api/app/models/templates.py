from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from .base import BaseSchema, TimestampMixin
from .enums import ChannelType


# ============================================
# Template
# ============================================
class TemplateBase(BaseModel):
    title: str
    content: str
    channel_hint: ChannelType | None = None
    shortcut: str | None = None
    subject: str | None = None


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    channel_hint: ChannelType | None = None
    shortcut: str | None = None
    subject: str | None = None


class Template(TemplateBase, TimestampMixin, BaseSchema):
    id: UUID
    owner_id: UUID
