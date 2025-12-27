from supabase import create_client, Client
from fastapi import Depends, HTTPException, Header
from uuid import UUID
from .config import get_settings

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
    Para desenvolvimento, aceita header X-User-Id como fallback.
    """
    settings = get_settings()

    # Dev mode: aceita owner_id direto do settings
    if settings.owner_id:
        return UUID(settings.owner_id)

    if not authorization:
        raise HTTPException(status_code=401, detail="Token não fornecido")

    # Remove "Bearer " prefix
    token = authorization.replace("Bearer ", "")

    # Verifica token com Supabase
    try:
        user = db.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Token inválido")
        return UUID(user.user.id)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")
