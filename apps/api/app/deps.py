import logging
from supabase import create_client, Client
from fastapi import Depends, HTTPException, Header
from uuid import UUID
from .config import get_settings

logger = logging.getLogger(__name__)

_supabase_client: Client | None = None


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        settings = get_settings()
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key
        )
    return _supabase_client


def get_owner_id() -> str:
    """Retorna owner_id do settings (single-user mode)."""
    settings = get_settings()
    return settings.owner_id


async def get_current_user_id(
    authorization: str | None = Header(default=None),
    db: Client = Depends(get_supabase),
) -> UUID:
    """
    Extrai user_id do token JWT.
    
    SEGURANÇA:
    - Em produção (DEV_MODE=false): SEMPRE valida token JWT
    - Em desenvolvimento (DEV_MODE=true): aceita owner_id do settings
    """
    settings = get_settings()

    # APENAS em dev mode explícito: aceita owner_id direto
    if settings.dev_mode and settings.owner_id:
        logger.debug("DEV_MODE: usando owner_id do settings")
        return UUID(settings.owner_id)

    # Produção: requer token válido
    if not authorization:
        raise HTTPException(status_code=401, detail="Token não fornecido")

    # Remove "Bearer " prefix
    token = authorization.replace("Bearer ", "").strip()
    
    if not token:
        raise HTTPException(status_code=401, detail="Token vazio")

    # Verifica token com Supabase
    try:
        user = db.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Token inválido")
        return UUID(user.user.id)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Falha na validação do token: {e}")
        raise HTTPException(status_code=401, detail="Token inválido")
