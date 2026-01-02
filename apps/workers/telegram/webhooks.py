"""
Webhooks para comunicação com n8n.

Este módulo contém funções para enviar eventos para o n8n,
que orquestra o processamento de mensagens.
"""

import os
import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx

# Configurações dos webhooks
N8N_API_KEY = os.environ.get("N8N_API_KEY", "")
N8N_WEBHOOK_INBOUND = os.environ.get("N8N_WEBHOOK_INBOUND", "")
N8N_WEBHOOK_OUTBOUND = os.environ.get("N8N_WEBHOOK_OUTBOUND", "")
N8N_WEBHOOK_SYNC = os.environ.get("N8N_WEBHOOK_SYNC", "")

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
        print(f"[WEBHOOK] URL não configurada, pulando envio")
        return None
        
    if not N8N_API_KEY:
        print(f"[WEBHOOK] API Key não configurada")
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


async def notify_inbound_message(
    account_id: str,
    owner_id: str,
    workspace_id: str | None,
    telegram_user_id: int,
    telegram_msg_id: int,
    sender: dict | None,
    content: dict,
    timestamp: datetime,
    is_group: bool = False,
    group_info: dict | None = None,
    message_type: str = "text",
) -> dict | None:
    """
    Notifica n8n sobre mensagem recebida (inbound).
    
    Args:
        account_id: ID da conta de integração
        owner_id: ID do owner
        workspace_id: ID do workspace
        telegram_user_id: ID do usuário/grupo no Telegram
        telegram_msg_id: ID da mensagem no Telegram
        sender: Dados do remetente {first_name, last_name, username, access_hash}
        content: Conteúdo {text, media_url, media_type, media_name}
        timestamp: Data/hora da mensagem
        is_group: Se é mensagem de grupo
        group_info: Info do grupo {title, username} se aplicável
    """
    payload = {
        "event": "inbound",
        "account_id": account_id,
        "owner_id": owner_id,
        "workspace_id": workspace_id,
        "telegram_user_id": telegram_user_id,
        "telegram_msg_id": telegram_msg_id,
        "sender": sender,
        "content": content,
        "timestamp": timestamp.isoformat() if timestamp else datetime.now(timezone.utc).isoformat(),
        "is_group": is_group,
        "group_info": group_info,
        "message_type": message_type,
    }
    
    print(f"[WEBHOOK] Enviando inbound: {'group' if is_group else 'user'}={telegram_user_id}, msg={telegram_msg_id}, type={message_type}")
    return await send_to_n8n(N8N_WEBHOOK_INBOUND, payload)


async def notify_outbound_message(
    account_id: str,
    owner_id: str,
    workspace_id: str | None,
    telegram_user_id: int,
    telegram_msg_id: int,
    content: dict,
    timestamp: datetime,
    is_group: bool = False,
    recipient: dict | None = None,
    group_info: dict | None = None,
) -> dict | None:
    """
    Notifica n8n sobre mensagem enviada (outbound) capturada do Telegram.
    
    Isso acontece quando o usuário envia mensagem pelo app do Telegram
    (não pelo nosso frontend).
    
    Args:
        account_id: ID da conta de integração
        owner_id: ID do owner
        workspace_id: ID do workspace
        telegram_user_id: ID do usuário/grupo destinatário
        telegram_msg_id: ID da mensagem no Telegram
        content: Conteúdo {text, media_url, media_type, media_name}
        timestamp: Data/hora da mensagem
        is_group: Se é mensagem de grupo
        recipient: Dados do destinatário {first_name, last_name, username}
    """
    payload = {
        "event": "outbound",
        "account_id": account_id,
        "owner_id": owner_id,
        "workspace_id": workspace_id,
        "telegram_user_id": telegram_user_id,
        "telegram_msg_id": telegram_msg_id,
        "recipient": recipient or {},
        "content": content,
        "timestamp": timestamp.isoformat() if timestamp else datetime.now(timezone.utc).isoformat(),
        "is_group": is_group,
        "group_info": group_info,
    }
    
    print(f"[WEBHOOK] Enviando outbound: {'group' if is_group else 'user'}={telegram_user_id}, msg={telegram_msg_id}")
    return await send_to_n8n(N8N_WEBHOOK_OUTBOUND, payload)


async def notify_sync_batch(
    account_id: str,
    owner_id: str,
    workspace_id: str | None,
    job_id: str,
    telegram_user_id: int,
    is_group: bool,
    sender: dict,
    messages: list[dict],
) -> dict | None:
    """
    Envia batch de mensagens de sync histórico para n8n.
    
    Args:
        account_id: ID da conta de integração
        owner_id: ID do owner
        workspace_id: ID do workspace
        job_id: ID do job de sync
        telegram_user_id: ID do usuário/grupo no Telegram
        is_group: Se é grupo
        sender: Dados do contato {first_name, last_name, username, photo_url}
        messages: Lista de mensagens [{id, telegram_msg_id, text, date, direction, media_url, media_type, media_name}]
        
    Returns:
        Resposta do n8n {status, conversation_id, identity_id, messages_inserted}
    """
    payload = {
        "event": "sync",
        "account_id": account_id,
        "owner_id": owner_id,
        "workspace_id": workspace_id,
        "job_id": job_id,
        "telegram_user_id": telegram_user_id,
        "is_group": is_group,
        "sender": sender,
        "messages": messages,
    }
    
    print(f"[WEBHOOK] Enviando sync batch: user={telegram_user_id}, msgs={len(messages)}")
    return await send_to_n8n(N8N_WEBHOOK_SYNC, payload)
