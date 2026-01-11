from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from .base import BaseSchema, TimestampMixin, SoftDeleteMixin
from .enums import IdentityType


# ============================================
# Contact Identity
# ============================================
class ContactIdentityBase(BaseModel):
    type: IdentityType
    value: str
    metadata: dict = {}


class ContactIdentityCreate(ContactIdentityBase):
    contact_id: UUID | None = None


class ContactIdentityUpdate(BaseModel):
    contact_id: UUID | None = None
    metadata: dict | None = None


class ContactIdentity(ContactIdentityBase, TimestampMixin, BaseSchema):
    id: UUID
    owner_id: UUID
    contact_id: UUID | None
    value_normalized: str


# ============================================
# Contact
# ============================================
class ContactBase(BaseModel):
    display_name: str
    lead_stage: str = "new"
    metadata: dict = {}


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    display_name: str | None = None
    lead_stage: str | None = None
    metadata: dict | None = None


class Contact(ContactBase, TimestampMixin, SoftDeleteMixin, BaseSchema):
    id: UUID
    owner_id: UUID


class ContactWithIdentities(Contact):
    identities: list[ContactIdentity] = []


# ============================================
# Link/Unlink Identity
# ============================================
class LinkIdentityRequest(BaseModel):
    identity_id: UUID


class UnlinkIdentityRequest(BaseModel):
    identity_id: UUID


# ============================================
# Link By Email
# ============================================
class LinkByEmailRequest(BaseModel):
    email: str
    conversation_id: str | None = None
    display_name: str | None = None


class LinkByEmailResponse(BaseModel):
    contact: dict
    identity: dict
    is_new: bool
    conversation_linked: bool = False
