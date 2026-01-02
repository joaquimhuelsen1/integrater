---
motivo: Documentar novo fluxo de sync histórico via n8n
milestone: M3
data: 2026-01-02
area: workers
impacto: alto
---

# Sync Histórico Telegram via n8n

## Contexto

Anteriormente, o sync de histórico do Telegram era feito diretamente pelo Worker inserindo mensagens no Supabase. Isso causava:
- Código duplicado (lógica de upsert identity/conversation em dois lugares)
- Inconsistência com fluxo inbound/outbound (que usam n8n)
- Falta de foto de perfil no sync (não buscava como inbound/outbound)

## Nova Arquitetura

```
Worker detecta job pendente (sync_history_jobs)
    ↓
Busca até 100 msgs do Telegram
    ↓
Busca dados do contato (nome, username, foto)
    ↓
Envia batch para n8n /sync
    ↓
n8n processa TUDO em 1 execução:
  1. Upsert Identity (com avatar_url)
  2. Upsert Conversation
  3. INSERT batch de mensagens (ON CONFLICT DO NOTHING)
  4. Update conversation.last_message_at
    ↓
Responde {status, conversation_id, identity_id, messages_inserted}
    ↓
Worker marca job completed
```

## Arquivos Modificados

- `apps/workers/telegram/webhooks.py` - Nova função `notify_sync_batch`
- `apps/workers/telegram/worker.py` - `_process_single_history_job` agora usa webhook
- `apps/workers/.env.example` - Nova variável `N8N_WEBHOOK_SYNC`

## Arquivos Removidos (funções)

- `_get_or_create_sync_identity` - n8n faz via SQL
- `_get_or_create_sync_conversation` - n8n faz via SQL
- `_process_incoming_media` - usa `_process_media_for_webhook` existente

## Configuração Necessária

### Variável de ambiente
```
N8N_WEBHOOK_SYNC=https://n8n.example.com/webhook/telegram/sync
```

### Constraint no banco (se não existir)
```sql
ALTER TABLE messages 
ADD CONSTRAINT messages_conversation_external_unique 
UNIQUE (conversation_id, external_message_id);
```

## Payload do Webhook

```json
{
  "event": "sync",
  "account_id": "uuid",
  "owner_id": "uuid",
  "workspace_id": "uuid",
  "job_id": "uuid",
  "telegram_user_id": 123456,
  "is_group": false,
  "sender": {
    "first_name": "John",
    "last_name": "Doe",
    "username": "johndoe",
    "photo_url": "https://..."
  },
  "messages": [
    {
      "id": "uuid",
      "telegram_msg_id": 100,
      "text": "Hello",
      "date": "2025-01-01T10:00:00Z",
      "direction": "inbound",
      "media_url": null,
      "media_type": null,
      "media_name": null
    }
  ]
}
```

## Resposta Esperada

```json
{
  "status": "ok",
  "conversation_id": "uuid",
  "identity_id": "uuid",
  "messages_inserted": 42
}
```

## SQL do n8n

Ver arquivo `SQL-N8N-SYNC.txt` na raiz do projeto.
