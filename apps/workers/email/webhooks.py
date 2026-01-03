"""
Webhooks para comunicacao com n8n - Email Worker.

Este modulo contem funcoes para enviar eventos para o n8n,
que orquestra o processamento de mensagens de email.
"""

import os
import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx

# Configuracoes dos webhooks
N8N_API_KEY = os.environ.get("N8N_API_KEY", "")
N8N_WEBHOOK_EMAIL_INBOUND = os.environ.get("N8N_WEBHOOK_EMAIL_INBOUND", "")

# Timeout para chamadas ao n8n (segundos)
N8N_TIMEOUT = 30


async def send_to_n8n(url: str, payload: dict) -> dict | None:
    """
    Envia payload para webhook do n8n.
    
    Args:
        url: URL do webhook
        payload: Dados a enviar
        
    Returns:
        Resposta do n8n ou None se falhou
    """
    if not url:
        print(f"[WEBHOOK] URL nao configurada, pulando envio")
        return None
        
    if not N8N_API_KEY:
        print(f"[WEBHOOK] API Key nao configurada")
        return None
    
    headers = {
        "Content-Type": "application/json",
        "X-API-KEY": N8N_API_KEY,
    }
    
    try:
        async with httpx.AsyncClient(timeout=N8N_TIMEOUT) as client:
            response = await client.post(url, json=payload, headers=headers)
            
            if response.status_code == 200:
                print(f"[WEBHOOK] Enviado com sucesso para {url}")
                try:
                    return response.json()
                except Exception:
                    return {"status": "ok"}
            else:
                print(f"[WEBHOOK] Erro {response.status_code}: {response.text}")
                return None
                
    except httpx.TimeoutException:
        print(f"[WEBHOOK] Timeout ao chamar {url}")
        return None
    except Exception as e:
        print(f"[WEBHOOK] Erro ao chamar {url}: {e}")
        return None


async def notify_inbound_email(
    account_id: str,
    owner_id: str,
    workspace_id: str | None,
    from_email: str,
    to_email: str,
    subject: str | None,
    body: str | None,
    html: str | None,
    attachments: list[dict] | None,
    message_id: str,
    in_reply_to: str | None,
    references: str | None,
    timestamp: datetime,
    sender_name: str | None = None,
) -> dict | None:
    """
    Notifica n8n sobre email recebido (inbound).
    
    Args:
        account_id: ID da conta de integracao
        owner_id: ID do owner
        workspace_id: ID do workspace
        from_email: Email do remetente
        to_email: Email do destinatario (nossa conta)
        subject: Assunto do email
        body: Corpo em texto plano
        html: Corpo em HTML
        attachments: Lista de attachments [{url, filename, mime_type, size}]
        message_id: Message-ID do email (header)
        in_reply_to: In-Reply-To header (para threading)
        references: References header (para threading)
        timestamp: Data/hora do email
        sender_name: Nome do remetente (se disponivel)
    """
    payload = {
        "event": "inbound",
        "account_id": account_id,
        "owner_id": owner_id,
        "workspace_id": workspace_id,
        "from_email": from_email,
        "to_email": to_email,
        "subject": subject,
        "body": body,
        "html": html,
        "attachments": attachments or [],
        "message_id": message_id,
        "in_reply_to": in_reply_to,
        "references": references,
        "timestamp": timestamp.isoformat() if timestamp else datetime.now(timezone.utc).isoformat(),
        "sender_name": sender_name,
    }
    
    print(f"[WEBHOOK] Enviando email inbound: from={from_email}, subject={subject[:50] if subject else 'N/A'}...")
    return await send_to_n8n(N8N_WEBHOOK_EMAIL_INBOUND, payload)


async def notify_outbound_email(
    account_id: str,
    owner_id: str,
    workspace_id: str | None,
    from_email: str,
    to_email: str,
    subject: str | None,
    body: str | None,
    html: str | None,
    attachments: list[dict] | None,
    message_id: str,
    in_reply_to: str | None,
    timestamp: datetime,
) -> dict | None:
    """
    Notifica n8n sobre email enviado (outbound).
    
    Isso acontece quando o worker envia um email com sucesso.
    
    Args:
        account_id: ID da conta de integracao
        owner_id: ID do owner
        workspace_id: ID do workspace
        from_email: Email do remetente (nossa conta)
        to_email: Email do destinatario
        subject: Assunto do email
        body: Corpo em texto plano
        html: Corpo em HTML
        attachments: Lista de attachments
        message_id: Message-ID gerado
        in_reply_to: In-Reply-To (se reply)
        timestamp: Data/hora do envio
    """
    payload = {
        "event": "outbound",
        "account_id": account_id,
        "owner_id": owner_id,
        "workspace_id": workspace_id,
        "from_email": from_email,
        "to_email": to_email,
        "subject": subject,
        "body": body,
        "html": html,
        "attachments": attachments or [],
        "message_id": message_id,
        "in_reply_to": in_reply_to,
        "timestamp": timestamp.isoformat() if timestamp else datetime.now(timezone.utc).isoformat(),
    }
    
    print(f"[WEBHOOK] Enviando email outbound: to={to_email}, subject={subject[:50] if subject else 'N/A'}...")
    return await send_to_n8n(N8N_WEBHOOK_EMAIL_INBOUND, payload)
