---
motivo: Diferenças entre PRD e estrutura real do DB
milestone: M2
data: 2025-12-19
area: api
impacto: alto
---

# Estrutura Real do DB vs PRD

## Contexto
Durante implementação do M2, descobri que a migration SQL criou tabelas com estrutura diferente do PRD original.

## Descoberta

### contacts
- PRD: `name`, `company`, `notes`
- Real: `display_name`, `lead_stage`, `metadata`

### contact_identities
- PRD: `platform_id`, `display_name`
- Real: `value`, `value_normalized`
- Enum `identity_type`: `telegram_user` | `email` | `phone`

### conversations
- PRD: `channel`, `display_name`, `last_message_preview`, `unread_count`
- Real: `last_channel`, `primary_identity_id`, `last_inbound_at`, `last_outbound_at`
- Sem: `display_name` (vem do contact join), `last_message_preview`, `unread_count`

### messages
- PRD: `status`, `reply_to_message_id`
- Real: `event`, `external_reply_to_message_id`, `topic`, `private`, `extension`
- Obrigatórios: `integration_account_id`, `external_message_id`

### templates
- PRD: `name`, `channel`
- Real: `title`, `channel_hint`, `shortcut`

### Enums
- `integration_type`: `telegram_user` | `email_imap_smtp` | `openphone`
- `identity_type`: `telegram_user` | `email` | `phone`

## Ação
1. Modelos Pydantic ajustados para refletir estrutura real
2. Componentes frontend ajustados
3. Seed SQL criado com colunas corretas

## Implicações
- Routers da API precisam usar nomes de colunas corretos
- Frontend precisa fazer join com contact para display_name
- Envio de mensagens requer `integration_account_id` e `external_message_id`
