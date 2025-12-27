from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from .base import BaseSchema
from .enums import LogLevel, ChannelType


# ============================================
# App Logs
# ============================================
class AppLog(BaseSchema):
    id: UUID
    owner_id: UUID
    source: str
    level: LogLevel
    message: str
    payload: dict = {}
    trace_id: str | None
    created_at: datetime


class LogListQuery(BaseModel):
    level: LogLevel | None = None
    source: str | None = None
    trace_id: str | None = None
    search: str | None = None
    cursor: UUID | None = None
    limit: int = 50


# ============================================
# Integration Events
# ============================================
class IntegrationEvent(BaseSchema):
    id: UUID
    owner_id: UUID
    integration_account_id: UUID
    channel: ChannelType
    event_type: str
    received_at: datetime
    processed_at: datetime | None
    status: str
    error: str | None
    payload: dict


# ============================================
# Backup Export
# ============================================
class ExportRequest(BaseModel):
    format: str  # "json" or "csv"


class ExportStatus(BaseSchema):
    id: UUID
    owner_id: UUID
    format: str
    status: str
    storage_bucket: str | None
    storage_path: str | None
    requested_at: datetime
    completed_at: datetime | None
    error: str | None
