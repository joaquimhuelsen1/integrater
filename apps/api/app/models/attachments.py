from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from .base import BaseSchema


class AttachmentBase(BaseModel):
    file_name: str | None = None
    mime_type: str | None = None
    byte_size: int | None = None


class Attachment(AttachmentBase, BaseSchema):
    id: UUID
    owner_id: UUID
    message_id: UUID
    storage_bucket: str
    storage_path: str
    sha256: str | None
    metadata: dict = {}
    created_at: datetime


# ============================================
# Storage Signed URLs
# ============================================
class SignUploadRequest(BaseModel):
    file_name: str
    mime_type: str
    byte_size: int


class SignUploadResponse(BaseModel):
    upload_url: str
    storage_path: str
    expires_at: datetime


class SignDownloadRequest(BaseModel):
    attachment_id: UUID


class SignDownloadResponse(BaseModel):
    download_url: str
    expires_at: datetime
