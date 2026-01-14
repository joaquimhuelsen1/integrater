from pydantic import BaseModel, Field, ConfigDict, field_validator
from datetime import datetime
from uuid import UUID
from enum import Enum
from typing import Literal
from .base import BaseSchema, TimestampMixin


# ============================================
# Enums
# ============================================
class ConversationRole(str, Enum):
    """Papeis na conversa com GLM."""
    system = "system"
    user = "user"
    assistant = "assistant"


class PlanStep(str, Enum):
    """Etapas do plano de relacionamento."""
    structure = "structure"
    intro = "intro"
    block_1 = "block_1"
    block_2 = "block_2"
    block_3 = "block_3"
    block_4 = "block_4"
    block_5 = "block_5"
    summary = "summary"
    faq = "faq"


# ============================================
# Enums
# ============================================
class PlanStatusType(str, Enum):
    """Status de um Relationship Plan durante a geracao."""
    draft = "draft"
    generating_structure = "generating_structure"
    generating_intro = "generating_intro"
    deepening_blocks = "deepening_blocks"
    generating_summary = "generating_summary"
    completed = "completed"
    error = "error"


# ============================================
# Relationship Plans - Request
# ============================================
class CreatePlanRequest(BaseModel):
    """Request para criar um novo plano de relacionamento."""
    form_data: dict = Field(default_factory=dict, description="Respostas do formulario")
    conversation_context: str | None = Field(None, description="Contexto de conversa adicional (texto livre)")


# ============================================
# Relationship Plans - Response
# ============================================
class PlanResponse(TimestampMixin, BaseSchema):
    """Representacao completa de um Relationship Plan."""
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: UUID
    owner_id: UUID
    workspace_id: UUID

    # Inputs
    form_data: dict = Field(default_factory=dict)
    conversation_context: str | None = None

    # Status
    status: PlanStatusType

    # Outputs gerados
    structure: dict | None = Field(None, description="Estrutura de blocos (titulo + descricao breve)")
    introduction: str | None = Field(None, description="Introducao do plano")
    deepened_blocks: dict = Field(default_factory=dict, description="Blocos aprofundados {block_id: content}")
    summary: str | None = Field(None, description="Resumo final")
    faq: list = Field(default_factory=list, description="FAQ em array de objetos")

    # Metadata de geracao
    model_used: str = "glm-4.7"
    generation_started_at: datetime | None = None
    generation_completed_at: datetime | None = None
    generation_duration_seconds: int | None = None
    tokens_estimated: int | None = None
    error_message: str | None = None

    # Validadores para compatibilidade com formato antigo
    @field_validator('deepened_blocks', mode='before')
    @classmethod
    def convert_deepened_blocks(cls, v):
        """Converte formato antigo (lista) para novo (dict)."""
        if isinstance(v, list):
            # Formato antigo: [{'numero': 1, 'conteudo': '...'}, ...]
            new_dict = {}
            for bloco in v:
                if isinstance(bloco, dict) and 'numero' in bloco:
                    block_id = f"phase_{bloco['numero'] - 1}"
                    new_dict[block_id] = {
                        "phase": {"title": f"Bloco {bloco['numero']}", "numero": bloco['numero']},
                        "details": {"conteudo": bloco.get('conteudo', '')}
                    }
            return new_dict
        return v or {}

    @field_validator('faq', mode='before')
    @classmethod
    def convert_faq(cls, v):
        """Converte formato antigo (string) para novo (lista)."""
        if isinstance(v, str):
            # Formato antigo: string markdown
            return [{"pergunta": "Perguntas Frequentes", "resposta": v[:1000]}]
        return v or []


class PlanListResponse(BaseModel):
    """Response de listagem de planos."""
    plans: list[PlanResponse]
    total: int


class PlanStatus(BaseModel):
    """Status de geracao de um plano."""
    status: PlanStatusType
    error_message: str | None = None
    generation_started_at: datetime | None = None


# ============================================
# Plan Prompts - Request/Response
# ============================================
class PlanPromptCreate(BaseModel):
    """Request para criar um novo prompt de plano."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    prompt_type: Literal["plan_system", "structure_context", "intro_context", "block_deepen", "summary_context"] = "plan_system"
    content: str = Field(..., min_length=1)
    is_active: bool = True


class PlanPromptUpdate(BaseModel):
    """Request para atualizar um prompt de plano existente."""
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    prompt_type: Literal["plan_system", "structure_context", "intro_context", "block_deepen", "summary_context"] | None = None
    content: str | None = None
    is_active: bool | None = None


class PlanPromptResponse(TimestampMixin, BaseSchema):
    """Representacao de um Prompt de Plano."""
    id: UUID
    owner_id: UUID
    workspace_id: UUID
    name: str
    description: str | None
    prompt_type: Literal["plan_system", "structure_context", "intro_context", "block_deepen", "summary_context"]
    content: str
    is_active: bool
    version: int


class PlanPromptListResponse(BaseModel):
    """Response de listagem de prompts de plano."""
    prompts: list[PlanPromptResponse]
    total: int


# ============================================
# Plan Conversation History - Request/Response
# ============================================
class PlanConversationMessage(TimestampMixin, BaseSchema):
    """Mensagem do historico de conversa de um plano."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plan_id: UUID
    role: ConversationRole
    content: str
    step: str | None = None
    block_id: str | None = None
    tokens_estimate: int | None = None


class PlanConversationListResponse(BaseModel):
    """Response de listagem de historico de conversa."""
    messages: list[PlanConversationMessage]
    total: int


class PlanConversationContinueRequest(BaseModel):
    """Request para continuar conversa com GLM."""
    message: str = Field(..., min_length=1, description="Mensagem do usuario")
    step: str | None = Field(None, description="Etapa especifica (opcional)")
    block_id: str | None = Field(None, description="ID do bloco para refinar (opcional)")


class PlanConversationContinueResponse(BaseModel):
    """Response de continuacao de conversa."""
    message: PlanConversationMessage
    response: PlanConversationMessage
    suggestions: list[str] = Field(default_factory=list, description="Sugestoes de continuacao")


class PlanRefineBlockRequest(BaseModel):
    """Request para refinar bloco especifico."""
    block_id: str = Field(..., description="ID do bloco a refinar (ex: phase_0)")
    instruction: str = Field(..., min_length=1, description="Instrucao de refinamento")


class PlanRefineBlockResponse(BaseModel):
    """Response de refinamento de bloco."""
    block_id: str
    previous_content: dict
    refined_content: dict
    messages_added: list[PlanConversationMessage]
