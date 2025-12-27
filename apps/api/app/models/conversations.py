from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from .base import BaseSchema, TimestampMixin, SoftDeleteMixin
from .enums import ConversationStatus, ChannelType
from .contacts import Contact, ContactIdentity


# ============================================
# Conversation
# ============================================
class ConversationBase(BaseModel):
    status: ConversationStatus = ConversationStatus.open
    metadata: dict = {}


class ConversationUpdate(BaseModel):
    status: ConversationStatus | None = None
    assigned_to_profile_id: UUID | None = None
    metadata: dict | None = None


class Conversation(ConversationBase, TimestampMixin, SoftDeleteMixin, BaseSchema):
    id: UUID
    owner_id: UUID
    contact_id: UUID | None
    primary_identity_id: UUID | None
    assigned_to_profile_id: UUID | None
    last_message_at: datetime | None
    last_inbound_at: datetime | None
    last_outbound_at: datetime | None
    last_channel: ChannelType | None


class ConversationWithDetails(Conversation):
    contact: Contact | None = None
    primary_identity: ContactIdentity | None = None
    tags: list["Tag"] = []
    last_message_preview: str | None = None


# ============================================
# Conversation List Query
# ============================================
class ConversationListQuery(BaseModel):
    channel: ChannelType | None = None
    status: ConversationStatus | None = None
    tag_ids: list[UUID] | None = None
    assigned_to: UUID | None = None
    unlinked: bool | None = None
    search: str | None = None
    cursor: UUID | None = None
    limit: int = 20


# ============================================
# Merge Conversations
# ============================================
class MergeConversationRequest(BaseModel):
    source_conversation_id: UUID


# Forward reference
from .tags import Tag
ConversationWithDetails.model_rebuild()
