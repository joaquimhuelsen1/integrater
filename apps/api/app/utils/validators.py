"""
Módulo de validação de inputs.

SEGURANÇA:
- Validação de formatos (E.164, email)
- Sanitização de dados
- Limites de tamanho
"""

import re
from typing import Optional


# === Regex Patterns ===

# E.164: +[código país][número] - 8 a 15 dígitos total
E164_PATTERN = re.compile(r'^\+[1-9]\d{7,14}$')

# Email: formato básico RFC 5322 simplificado
EMAIL_PATTERN = re.compile(
    r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
)

# Hostname: para IMAP/SMTP hosts
HOSTNAME_PATTERN = re.compile(
    r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$'
)


# === Validation Functions ===

def validate_e164(phone: str) -> str:
    """
    Valida e normaliza número de telefone E.164.
    
    Args:
        phone: Número de telefone
        
    Returns:
        Número normalizado
        
    Raises:
        ValueError: Se formato inválido
    """
    phone = phone.strip()
    
    # Remove espaços e hífens comuns
    phone = re.sub(r'[\s\-\(\)]', '', phone)
    
    # Adiciona + se não tiver
    if not phone.startswith('+'):
        phone = '+' + phone
    
    if not E164_PATTERN.match(phone):
        raise ValueError(
            f"Telefone inválido. Use formato E.164: +5511999999999"
        )
    
    return phone


def validate_email(email_addr: str) -> str:
    """
    Valida e normaliza endereço de email.
    
    Args:
        email_addr: Endereço de email
        
    Returns:
        Email normalizado (lowercase)
        
    Raises:
        ValueError: Se formato inválido
    """
    email_addr = email_addr.strip().lower()
    
    if len(email_addr) > 254:
        raise ValueError("Email muito longo (máx 254 caracteres)")
    
    if not EMAIL_PATTERN.match(email_addr):
        raise ValueError(
            f"Email inválido: {email_addr}"
        )
    
    return email_addr


def validate_hostname(hostname: str) -> str:
    """
    Valida hostname para IMAP/SMTP.
    
    Args:
        hostname: Hostname do servidor
        
    Returns:
        Hostname normalizado
        
    Raises:
        ValueError: Se formato inválido
    """
    hostname = hostname.strip().lower()
    
    if len(hostname) > 253:
        raise ValueError("Hostname muito longo (máx 253 caracteres)")
    
    if not HOSTNAME_PATTERN.match(hostname):
        raise ValueError(
            f"Hostname inválido: {hostname}"
        )
    
    return hostname


def validate_port(port: int, min_port: int = 1, max_port: int = 65535) -> int:
    """
    Valida número de porta.
    
    Args:
        port: Número da porta
        min_port: Porta mínima (default 1)
        max_port: Porta máxima (default 65535)
        
    Returns:
        Porta validada
        
    Raises:
        ValueError: Se porta inválida
    """
    if not isinstance(port, int) or port < min_port or port > max_port:
        raise ValueError(
            f"Porta inválida: {port}. Use valor entre {min_port} e {max_port}"
        )
    
    return port


def sanitize_text(text: str, max_length: Optional[int] = None) -> str:
    """
    Sanitiza texto removendo caracteres de controle.
    
    Args:
        text: Texto para sanitizar
        max_length: Tamanho máximo opcional
        
    Returns:
        Texto sanitizado
    """
    if not text:
        return ""
    
    # Remove caracteres de controle exceto newline e tab
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    
    if max_length and len(text) > max_length:
        text = text[:max_length]
    
    return text


def mask_sensitive(value: str, visible_chars: int = 4) -> str:
    """
    Mascara dados sensíveis para logs.
    
    Args:
        value: Valor para mascarar
        visible_chars: Caracteres visíveis no início
        
    Returns:
        Valor mascarado (ex: "1234****")
    """
    if not value or len(value) <= visible_chars:
        return "****"
    
    return value[:visible_chars] + "*" * (len(value) - visible_chars)
