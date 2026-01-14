from pydantic_settings import BaseSettings
from functools import lru_cache
from dotenv import load_dotenv
import os

# Carrega .env explicitamente
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # Auth
    owner_id: str
    dev_mode: bool = False  # Se True, bypassa JWT validation (APENAS para dev local)

    # Criptografia
    encryption_key: str

    # Telegram
    telegram_api_id: int = 0
    telegram_api_hash: str = ""

    # Gemini
    gemini_api_key: str
    gemini_flash_model: str = "gemini-3-flash-preview"
    gemini_pro_model: str = "gemini-3-pro-preview"
    
    # DeepL
    deepl_api_key: str = ""  # Opcional - se vazio, usa Google Translate

    # Zhipu AI (GLM)
    zhipu_api_key: str = ""
    zhipu_model: str = "glm-4.7"
    zhipu_timeout: float = 60.0
    zhipu_max_retries: int = 3

    # OpenPhone (secrets diferentes por webhook)
    openphone_webhook_secret_inbound: str = ""  # Secret do webhook /inbound
    openphone_webhook_secret_status: str = ""   # Secret do webhook /status

    # CORS (URL do frontend)
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
