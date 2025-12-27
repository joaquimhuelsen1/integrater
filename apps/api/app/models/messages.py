from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from .base import BaseSchema
from .enums import ChannelType, MessageDirection, MessageEventType


# ============================================
# Message
# ============================================
class MessageBase(BaseModel):
    text: str | None = None
    subject: str | None = None
    html: str | None = None


class MessageSendRequest(BaseModel):
    conversation_id: UUID
    channel: ChannelType
    integration_account_id: UUID
    text: str
    attachments: list[UUID] = []
    reply_to_message_id: UUID | None = None


class Message(MessageBase, BaseSchema):
    id: UUID
    owner_id: UUID
    conversation_id: UUID
    integration_account_id: UUID
    identity_id: UUID
    channel: ChannelType
    direction: MessageDirection
    external_message_id: str
    external_chat_id: str | None
    external_reply_to_message_id: str | None
    from_address: str | None
    to_address: str | None
    sent_at: datetime
    created_at: datetime
    edited_at: datetime | None
    deleted_at: datetime | None
    raw_payload: dict = {}


class MessageWithAttachments(Message):
    attachments: list["Attachment"] = []
    translation: "MessageTranslation | None" = None


# ============================================
# Message Event
# ============================================
class MessageEvent(BaseSchema):
    id: UUID
    owner_id: UUID
    message_id: UUID
    type: MessageEventType
    occurred_at: datetime
    payload: dict = {}


# ============================================
# Message List Query
# ============================================
class MessageListQuery(BaseModel):
    cursor: UUID | None = None
    limit: int = 50


# Forward references
from .attachments import Attachment
from .translations import MessageTranslation
MessageWithAttachments.model_rebuild()
