"""
Models Pydantic para CRM/Kanban.
"""
from pydantic import BaseModel, Field
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from typing import Any

from .base import BaseSchema, TimestampMixin
from .enums import (
    CustomFieldType,
    DealActivityType,
    AutomationTriggerType,
    AutomationActionType,
)


# ============================================
# Pipeline
# ============================================
class PipelineBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    color: str = "#3b82f6"


class PipelineCreate(PipelineBase):
    pass


class PipelineUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    position: int | None = None
    is_archived: bool | None = None


class Pipeline(PipelineBase, TimestampMixin, BaseSchema):
    id: UUID
    owner_id: UUID
    position: int
    is_archived: bool


class PipelineWithStages(Pipeline):
    stages: list["Stage"] = []


class PipelineApiKey(BaseModel):
    id: UUID
    pipeline_id: UUID
    api_key: str
    created_at: datetime
    updated_at: datetime


# ============================================
# Stage
# ============================================
class StageBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = "#6b7280"
    is_win: bool = False
    is_loss: bool = False


class StageCreate(StageBase):
    pass


class StageUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    position: int | None = None
    is_win: bool | None = None
    is_loss: bool | None = None


class Stage(StageBase, TimestampMixin, BaseSchema):
    id: UUID
    owner_id: UUID
    pipeline_id: UUID
    position: int


class StageReorderRequest(BaseModel):
    stage_ids: list[UUID]


# ============================================
# Custom Field
# ============================================
class CustomFieldOption(BaseModel):
    value: str
    label: str


class CustomFieldBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    field_type: CustomFieldType
    options: list[CustomFieldOption] | None = None
    is_required: bool = False


class CustomFieldCreate(CustomFieldBase):
    pipeline_id: UUID | None = None


class CustomFieldUpdate(BaseModel):
    name: str | None = None
    options: list[CustomFieldOption] | None = None
    is_required: bool | None = None
    position: int | None = None


class CustomField(CustomFieldBase, BaseSchema):
    id: UUID
    owner_id: UUID
    pipeline_id: UUID | None
    position: int
    created_at: datetime


# ============================================
# Deal
# ============================================
class DealBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    value: Decimal = Decimal("0")
    probability: int = Field(default=50, ge=0, le=100)
    expected_close_date: date | None = None
    custom_fields: dict[str, Any] = {}
    info: str | None = None


class DealCreate(DealBase):
    pipeline_id: UUID
    stage_id: UUID
    contact_id: UUID | None = None
    conversation_id: UUID | None = None


class DealUpdate(BaseModel):
    title: str | None = None
    value: Decimal | None = None
    probability: int | None = Field(default=None, ge=0, le=100)
    expected_close_date: date | None = None
    custom_fields: dict[str, Any] | None = None
    stage_id: UUID | None = None
    contact_id: UUID | None = None
    conversation_id: UUID | None = None


class Deal(DealBase, TimestampMixin, BaseSchema):
    id: UUID
    owner_id: UUID
    pipeline_id: UUID
    stage_id: UUID
    contact_id: UUID | None
    conversation_id: UUID | None
    won_at: datetime | None
    lost_at: datetime | None
    lost_reason: str | None
    archived_at: datetime | None


class DealWithDetails(Deal):
    stage: Stage | None = None
    contact: Any | None = None  # Contact type
    products: list["DealProduct"] = []
    products_total: Decimal = Decimal("0")


class DealMoveRequest(BaseModel):
    stage_id: UUID


class DealWinRequest(BaseModel):
    pass


class DealLoseRequest(BaseModel):
    reason: str | None = None
    reason_id: UUID | None = None  # Referência a loss_reasons.id
    description: str | None = None  # Descrição adicional


# ============================================
# Product Catalog (catálogo de produtos)
# ============================================
class ProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    value: Decimal = Decimal("0")
    sku: str | None = None
    category: str | None = None


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    value: Decimal | None = None
    sku: str | None = None
    category: str | None = None
    is_active: bool | None = None


class Product(ProductBase, BaseSchema):
    id: UUID
    owner_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ============================================
# Deal Product
# ============================================
class DealProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    value: Decimal = Decimal("0")


class DealProductCreate(BaseModel):
    product_id: UUID | None = None  # Se informado, usa dados do catálogo
    name: str | None = None  # Se product_id não informado
    value: Decimal | None = None  # Se product_id não informado


class DealProduct(DealProductBase, BaseSchema):
    id: UUID
    owner_id: UUID
    deal_id: UUID
    product_id: UUID | None = None
    created_at: datetime


# ============================================
# Deal Activity
# ============================================
class DealActivityBase(BaseModel):
    activity_type: DealActivityType
    content: str | None = None


class DealActivityCreate(BaseModel):
    activity_type: DealActivityType = DealActivityType.note
    content: str | None = None
    due_date: datetime | None = None  # para tasks


class DealActivityUpdate(BaseModel):
    content: str | None = None
    is_completed: bool | None = None
    due_date: datetime | None = None


class DealActivity(DealActivityBase, BaseSchema):
    id: UUID
    owner_id: UUID
    deal_id: UUID
    is_completed: bool
    due_date: datetime | None
    from_stage_id: UUID | None
    to_stage_id: UUID | None
    field_name: str | None
    old_value: str | None
    new_value: str | None
    message_id: UUID | None
    created_at: datetime


class DealActivityWithStages(DealActivity):
    from_stage: Stage | None = None
    to_stage: Stage | None = None


# ============================================
# Automation Rule
# ============================================
class AutomationCondition(BaseModel):
    field: str  # "value", "probability", "stage_id", custom field id
    operator: str  # "eq", "neq", "gt", "gte", "lt", "lte", "contains"
    value: Any


class AutomationRuleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    trigger_type: AutomationTriggerType
    trigger_config: dict[str, Any] = {}
    conditions: list[AutomationCondition] = []
    action_type: AutomationActionType
    action_config: dict[str, Any] = {}


class AutomationRuleCreate(AutomationRuleBase):
    pipeline_id: UUID


class AutomationRuleUpdate(BaseModel):
    name: str | None = None
    trigger_type: AutomationTriggerType | None = None
    trigger_config: dict[str, Any] | None = None
    conditions: list[AutomationCondition] | None = None
    action_type: AutomationActionType | None = None
    action_config: dict[str, Any] | None = None
    is_active: bool | None = None


class AutomationRule(AutomationRuleBase, TimestampMixin, BaseSchema):
    id: UUID
    owner_id: UUID
    pipeline_id: UUID
    is_active: bool


# ============================================
# Deal Score (IA)
# ============================================
class DealScoreFactors(BaseModel):
    engagement: int | None = None
    value_fit: int | None = None
    timeline: int | None = None
    activity: int | None = None


class DealScore(BaseSchema):
    id: UUID
    owner_id: UUID
    deal_id: UUID
    score: int
    factors: DealScoreFactors
    recommendation: str | None
    model: str
    created_at: datetime


# ============================================
# Deal Tags
# ============================================
class DealTagBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str = "#6b7280"


class DealTagCreate(DealTagBase):
    pass


class DealTagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class DealTag(DealTagBase, BaseSchema):
    id: UUID
    owner_id: UUID
    created_at: datetime


# ============================================
# Deal Files
# ============================================
class DealFileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    file_url: str
    file_size: int | None = None
    mime_type: str | None = None


class DealFileCreate(BaseModel):
    name: str
    file_url: str
    file_size: int | None = None
    mime_type: str | None = None


class DealFile(DealFileBase, BaseSchema):
    id: UUID
    owner_id: UUID
    deal_id: UUID
    created_at: datetime


# ============================================
# CRM Stats / Analytics
# ============================================
class PipelineStats(BaseModel):
    pipeline_id: UUID
    pipeline_name: str
    total_deals: int
    total_value: Decimal
    won_deals: int
    won_value: Decimal
    lost_deals: int
    conversion_rate: float
    avg_deal_value: Decimal


class StageStats(BaseModel):
    stage_id: UUID
    stage_name: str
    stage_color: str
    deals_count: int
    total_value: Decimal
    avg_time_days: float | None


class FunnelData(BaseModel):
    stages: list[StageStats]


# Rebuild forward refs
PipelineWithStages.model_rebuild()
DealWithDetails.model_rebuild()
DealActivityWithStages.model_rebuild()
