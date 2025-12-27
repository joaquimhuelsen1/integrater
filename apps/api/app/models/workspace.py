from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class WorkspaceBase(BaseModel):
    name: str
    color: str = "#3b82f6"
    icon: str = "briefcase"


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class Workspace(WorkspaceBase):
    id: UUID
    owner_id: UUID
    is_default: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkspaceSummary(BaseModel):
    """Resumo de um workspace para analytics"""
    id: UUID
    name: str
    color: str
    deals_count: int = 0
    deals_value: float = 0
    conversations_count: int = 0
    unread_count: int = 0


class AnalyticsSummary(BaseModel):
    """Resumo geral cross-workspace"""
    workspaces: list[WorkspaceSummary]
    totals: dict
