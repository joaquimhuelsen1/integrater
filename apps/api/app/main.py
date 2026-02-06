import logging
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.routers import (
    health_router,
    contacts_router,
    conversations_router,
    messages_router,
    tags_router,
    templates_router,
    storage_router,
    telegram_router,
    translate_router,
    ai_router,
    prompts_router,
    openphone_router,
    email_router,
    logs_router,
    export_router,
    transcribe_router,
    ai_config_router,
    pipelines_router,
    deals_router,
    crm_analytics_router,
    products_router,
    deal_tags_router,
    workspaces_router,
    analytics_router,
    loss_reasons_router,
    webhooks_router,
    automations_router,
    integrations_router,
    purchases_router,
    preferences_router,
    plans_router,
    plan_prompts_router,
    broadcast_router,
)

settings = get_settings()

# === Configuração de Logging ===
# Nível baseado em DEV_MODE: DEBUG em dev, INFO em produção
log_level = logging.DEBUG if settings.dev_mode else logging.INFO

logging.basicConfig(
    level=log_level,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# Reduz verbosidade de libs externas
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("supabase").setLevel(logging.WARNING)
logging.getLogger("telethon").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)
logger.info(f"API iniciando - DEV_MODE={settings.dev_mode}")

# Rate Limiter (100 req/min por IP)
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Inbox Multicanal API",
    description="API para centralizar atendimento comercial via Telegram, Email e SMS",
    version="0.1.0",
)

# Registra rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS - origens permitidas
allowed_origins = [
    "http://localhost:3000",
    settings.frontend_url,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Routers
app.include_router(health_router)
app.include_router(contacts_router)
app.include_router(conversations_router)
app.include_router(messages_router)
app.include_router(tags_router)
app.include_router(templates_router)
app.include_router(storage_router)
app.include_router(telegram_router)
app.include_router(translate_router)
app.include_router(ai_router)
app.include_router(prompts_router)
app.include_router(openphone_router)
app.include_router(email_router)
app.include_router(logs_router)
app.include_router(export_router)
app.include_router(transcribe_router)
app.include_router(ai_config_router)
app.include_router(pipelines_router)
app.include_router(deals_router)
app.include_router(crm_analytics_router)
app.include_router(products_router)
app.include_router(deal_tags_router)
app.include_router(workspaces_router)
app.include_router(analytics_router)
app.include_router(loss_reasons_router)
app.include_router(webhooks_router)
app.include_router(automations_router)
app.include_router(integrations_router)
app.include_router(purchases_router)
app.include_router(preferences_router)
app.include_router(plans_router)
app.include_router(plan_prompts_router)
app.include_router(broadcast_router)
