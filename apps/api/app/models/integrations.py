from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from .base import BaseSchema, TimestampMixin
from .enums import IntegrationType, WorkerType


# ============================================
# Integration Account
# ============================================
class IntegrationBase(BaseModel):
    type: IntegrationType
    label: str
    config: dict = {}
    is_active: bool = True


class IntegrationCreate(IntegrationBase):
    pass


class IntegrationUpdate(BaseModel):
    label: str | None = None
    config: dict | None = None
    is_active: bool | None = None


class Integration(IntegrationBase, TimestampMixin, BaseSchema):
    id: UUID
    owner_id: UUID
    last_sync_at: datetime | None
    last_error: str | None


# ============================================
# Telegram Auth Flow
# ============================================
class TelegramStartAuthRequest(BaseModel):
    phone_number: str


class TelegramStartAuthResponse(BaseModel):
    phone_code_hash: str
    message: str


class TelegramVerifyCodeRequest(BaseModel):
    phone_number: str
    phone_code_hash: str
    code: str


class TelegramVerifyCodeResponse(BaseModel):
    success: bool
    needs_2fa: bool = False
    integration_id: UUID | None = None


class TelegramVerify2FARequest(BaseModel):
    phone_number: str
    password: str


class TelegramVerify2FAResponse(BaseModel):
    success: bool
    integration_id: UUID


# ============================================
# Worker Heartbeat
# ============================================
class WorkerHeartbeat(BaseSchema):
    id: UUID
    owner_id: UUID
    integration_account_id: UUID
    worker_type: WorkerType
    status: str
    last_heartbeat_at: datetime
    metadata: dict = {}
    created_at: datetime
    updated_at: datetime


class WorkerStatusItem(BaseModel):
    account_id: UUID
    label: str
    status: str
    last_heartbeat: datetime | None


class WorkersStatusResponse(BaseModel):
    telegram: list[WorkerStatusItem] = []
    email: list[WorkerStatusItem] = []


# ============================================
# Sync History (Telegram)
# ============================================
class SyncHistoryRequest(BaseModel):
    account_id: UUID
    period: str  # "1d", "3d", "7d"
    workspace_id: UUID


class SyncJobStatus(BaseModel):
    id: UUID
    conversation_id: UUID
    status: str  # pending, processing, completed, failed
    messages_synced: int | None = None
    error_message: str | None = None
    created_at: datetime


class SyncHistoryResponse(BaseModel):
    jobs_created: int
    job_ids: list[UUID]
    messages_synced: int | None = None  # Total de diálogos descobertos
