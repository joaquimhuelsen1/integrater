from .health import router as health_router
from .contacts import router as contacts_router
from .conversations import router as conversations_router
from .messages import router as messages_router
from .tags import router as tags_router
from .templates import router as templates_router
from .storage import router as storage_router
from .telegram import router as telegram_router
from .translate import router as translate_router
from .ai import router as ai_router
from .prompts import router as prompts_router
from .openphone import router as openphone_router
from .email import router as email_router
from .logs import router as logs_router
from .export import router as export_router
from .transcribe import router as transcribe_router
from .ai_config import router as ai_config_router
from .pipelines import router as pipelines_router
from .deals import router as deals_router
from .crm_analytics import router as crm_analytics_router
from .products import router as products_router
from .deal_tags import router as deal_tags_router
from .workspaces import router as workspaces_router
from .analytics import router as analytics_router
from .loss_reasons import router as loss_reasons_router
from .webhooks import router as webhooks_router
from .automations import router as automations_router
from .integrations import router as integrations_router
from .purchases import router as purchases_router
from .preferences import router as preferences_router
from .plans import router as plans_router
from .plan_prompts import router as plan_prompts_router

__all__ = [
    "health_router",
    "contacts_router",
    "conversations_router",
    "messages_router",
    "tags_router",
    "templates_router",
    "storage_router",
    "telegram_router",
    "translate_router",
    "ai_router",
    "prompts_router",
    "openphone_router",
    "email_router",
    "logs_router",
    "export_router",
    "transcribe_router",
    "ai_config_router",
    "pipelines_router",
    "deals_router",
    "crm_analytics_router",
    "products_router",
    "deal_tags_router",
    "workspaces_router",
    "analytics_router",
    "loss_reasons_router",
    "webhooks_router",
    "automations_router",
    "integrations_router",
    "purchases_router",
    "preferences_router",
    "plans_router",
    "plan_prompts_router",
]
