---
motivo: Documentar novo fluxo de envio de mensagens Telegram
milestone: M3
data: 2026-01-02
area: api
impacto: alto
---

# Fluxo de Envio Telegram via Worker HTTP

## Contexto

O worker Telegram teve o loop de outbound removido quando integramos com n8n. Isso fez com que mensagens enviadas pelo frontend ficassem apenas no banco local, sem serem enviadas para o Telegram.

## Problema

1. Frontend chama `POST /messages/send`
2. API insere mensagem no Supabase com `external_message_id: local-{uuid}`
3. **Nada enviava para o Telegram** - loop de outbound foi removido

## Solucao

API agora chama a API HTTP do Worker diretamente:

```
Frontend -> API /messages/send -> Worker HTTP /send -> Telegram
```

## Fluxo Detalhado

1. **Frontend** envia request para `POST /messages/send`
2. **API** busca `telegram_user_id` da identity da conversa
3. **API** busca `integration_account_id` do workspace
4. **API** monta lista de `attachment_urls` se houver
5. **API** chama `POST http://telegram-worker:8001/send` com:
   - `account_id`: UUID da conta Telegram
   - `telegram_user_id`: int do destinatario
   - `text`: texto da mensagem
   - `attachments`: lista de URLs do Supabase Storage
6. **Worker** envia via Telethon
7. **Worker** retorna `telegram_msg_id`
8. **API** atualiza `external_message_id` no banco

## Configuracao

Variaveis de ambiente na API:

```env
TELEGRAM_WORKER_URL=http://telegram-worker:8001
WORKER_API_KEY=sua-api-key
```

No Docker, os containers estao na mesma rede, entao `telegram-worker:8001` funciona.

## Arquivos Modificados

- `apps/api/app/routers/messages.py:130-197` - logica de envio
- `apps/api/.env.example` - novas variaveis

## Implicacoes

- n8n continua processando inbound/outbound **capturados** do Telegram
- API envia diretamente para Worker (mais simples que passar por n8n)
- Worker gera evento outbound que n8n captura e insere no banco (duplicado? verificar)

## Duplicatas

**Nao ha duplicatas** gracas ao `ON CONFLICT DO NOTHING`:

1. API insere com `external_message_id: local-{uuid}`
2. Worker envia, retorna `telegram_msg_id`
3. API atualiza `external_message_id` para `telegram_msg_id`
4. Worker captura outbound, envia para n8n com mesmo `telegram_msg_id`
5. n8n tenta inserir mas `ON CONFLICT (conversation_id, external_message_id) DO NOTHING`
6. Insert ignorado - sem duplicata
