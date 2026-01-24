"""
Cache simples com TTL para reduzir queries ao banco.
Usado principalmente em endpoints de analytics/stats.
"""
import time
from typing import Any, Callable
from functools import wraps
import hashlib
import json
import logging

logger = logging.getLogger(__name__)

# Cache em memória com TTL
_cache: dict[str, tuple[Any, float]] = {}

# TTLs padrão (em segundos)
TTL_REALTIME = 5  # Listas de inbox (conversas, mensagens) - curto para não afetar UX
TTL_SHORT = 10    # Stats que mudam frequentemente
TTL_MEDIUM = 30   # Stats gerais
TTL_LONG = 300    # Dados que raramente mudam (stages, pipelines)


def _make_key(prefix: str, *args, **kwargs) -> str:
    """Gera uma chave de cache única baseada nos argumentos."""
    # Serializa args e kwargs para criar hash único
    key_data = json.dumps({
        "args": [str(a) for a in args],
        "kwargs": {k: str(v) for k, v in sorted(kwargs.items())}
    }, sort_keys=True)
    key_hash = hashlib.md5(key_data.encode()).hexdigest()[:16]
    return f"{prefix}:{key_hash}"


def get_cached(key: str) -> tuple[Any | None, bool]:
    """
    Retorna valor do cache se existir e não expirado.
    Returns: (value, hit) - hit=True se encontrou no cache
    """
    if key in _cache:
        value, expires_at = _cache[key]
        if time.time() < expires_at:
            return value, True
        # Expirado, remove
        del _cache[key]
    return None, False


def set_cached(key: str, value: Any, ttl: int = TTL_MEDIUM) -> None:
    """Armazena valor no cache com TTL."""
    expires_at = time.time() + ttl
    _cache[key] = (value, expires_at)


def invalidate_cache(prefix: str = None) -> int:
    """
    Invalida cache. Se prefix fornecido, invalida apenas chaves com esse prefixo.
    Returns: número de chaves invalidadas
    """
    global _cache
    if prefix is None:
        count = len(_cache)
        _cache = {}
        return count

    keys_to_delete = [k for k in _cache if k.startswith(prefix)]
    for key in keys_to_delete:
        del _cache[key]
    return len(keys_to_delete)


def cleanup_expired() -> int:
    """Remove entradas expiradas. Retorna número de entradas removidas."""
    now = time.time()
    expired = [k for k, (_, exp) in _cache.items() if exp <= now]
    for key in expired:
        del _cache[key]
    return len(expired)


def cached(prefix: str, ttl: int = TTL_MEDIUM, key_args: list[str] | None = None):
    """
    Decorador para cachear resultado de função async.

    Args:
        prefix: Prefixo para a chave de cache
        ttl: Tempo de vida em segundos
        key_args: Lista de nomes de argumentos para incluir na chave
                  Se None, usa todos os argumentos

    Uso:
        @cached("crm_stats", ttl=60, key_args=["owner_id", "pipeline_id"])
        async def get_crm_stats(owner_id, pipeline_id, db):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extrai argumentos para a chave
            if key_args:
                cache_kwargs = {k: kwargs.get(k) for k in key_args if k in kwargs}
            else:
                # Exclui 'db' e outros objetos não serializáveis
                cache_kwargs = {k: v for k, v in kwargs.items()
                               if k not in ('db', 'request', 'response')}

            cache_key = _make_key(prefix, **cache_kwargs)

            # Tenta buscar do cache
            cached_value, hit = get_cached(cache_key)
            if hit:
                logger.debug(f"Cache HIT: {cache_key}")
                return cached_value

            # Cache miss - executa função
            logger.debug(f"Cache MISS: {cache_key}")
            result = await func(*args, **kwargs)

            # Armazena no cache
            set_cached(cache_key, result, ttl)

            return result

        return wrapper
    return decorator


# Estatísticas do cache
def get_cache_stats() -> dict:
    """Retorna estatísticas do cache."""
    now = time.time()
    total = len(_cache)
    valid = sum(1 for _, exp in _cache.values() if exp > now)
    return {
        "total_entries": total,
        "valid_entries": valid,
        "expired_entries": total - valid,
    }
