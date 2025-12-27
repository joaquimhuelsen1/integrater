# Tasks - Workers

Tarefas relacionadas aos workers Telegram/Email (apps/workers).

## Pendentes

<!-- Adicionar tarefas pendentes aqui -->

## Em Andamento

<!-- Tarefas sendo trabalhadas -->

## Concluídas

#### [WORKERS-001] Implementar worker Telegram ✅
**Data:** 2025-12-20
**Resultado:** Worker Telegram funcional com Telethon
**Funcionalidades:**
- Conexão automática com contas ativas do banco
- Recebe mensagens e salva no Supabase
- Cria contatos/identidades automaticamente
- Heartbeat para monitoramento de status
- Reconnect em caso de desconexão
**Arquivos:**
- `apps/workers/telegram/worker.py` - worker principal
- `apps/workers/telegram/requirements.txt` - dependências
- `apps/workers/shared/db.py` - cliente Supabase
- `apps/workers/shared/crypto.py` - encrypt/decrypt
- `apps/workers/shared/heartbeat.py` - monitoramento

#### [WORKERS-002] Implementar envio outbound Telegram ✅
**Data:** 2025-12-20
**Resultado:** Worker envia mensagens outbound para Telegram
**Funcionalidades:**
- Loop de polling para mensagens outbound pendentes
- Busca mensagens com external_message_id "local-*"
- Envia via Telethon para telegram_user_id
- Atualiza external_message_id com ID real após envio
- Retry automático se conta não conectada (race condition fix)
**Arquivos:**
- `apps/workers/telegram/worker.py` - _outbound_loop, _send_telegram_message
**Anotação:** `docs/workers/anotacao-outbound-race-condition-2025-12-20.md`

#### [WORKERS-003] Conversas não vinculadas (PRD 5.4) ✅
**Data:** 2025-12-20
**Resultado:** Worker cria identities sem contato conforme PRD
**Funcionalidades:**
- Cria identity com contact_id=None para novos remetentes
- Cria conversa com primary_identity_id (sem contact_id)
- Frontend mostra dados da identity quando não há contato vinculado
- Badge "Novo" para conversas não vinculadas
**Arquivos:**
- `apps/workers/telegram/worker.py` - _get_or_create_identity, _get_or_create_conversation
- `apps/web/src/components/inbox/conversation-item.tsx` - display name e badge

#### [WORKERS-004] Implementar worker Email IMAP/SMTP ✅
**Data:** 2025-12-20
**Resultado:** Worker Email funcional com IMAP e SMTP
**Funcionalidades:**
- Conexão IMAP com poll fallback (30s)
- Recebe emails e salva no Supabase
- Envia emails via SMTP
- Threading por headers (In-Reply-To, References)
- Cria identities/conversas automaticamente
- Heartbeat para monitoramento
**Arquivos:**
- `apps/workers/email/worker.py` - worker principal
- `apps/workers/email/requirements.txt` - dependências
- `apps/api/app/routers/email.py` - endpoints de conta
- `apps/web/src/components/settings-view.tsx` - UI cadastro

#### [WORKERS-005] Capturar mensagens outbound de outros apps ✅
**Data:** 2025-12-20
**Resultado:** Worker captura mensagens enviadas pelo usuário em outros apps (Telegram, etc)
**Funcionalidades:**
- Handler para eventos `outgoing=True` no Telethon
- Método `_handle_outgoing_message` processa mensagens enviadas
- Verifica duplicatas antes de inserir
- Processa mídia de mensagens outgoing
**Arquivos:**
- `apps/workers/telegram/worker.py` - handler_outgoing, _handle_outgoing_message

#### [WORKERS-006] Sincronização de histórico de mensagens ✅
**Data:** 2025-12-20
**Resultado:** Botão para recuperar histórico completo de conversas antigas
**Funcionalidades:**
- Tabela `sync_history_jobs` para enfileirar jobs
- Endpoint POST `/conversations/{id}/sync-history` para criar job
- Loop `_history_sync_loop` no worker processa jobs
- Usa `client.iter_messages()` para buscar histórico
- Evita duplicatas comparando external_message_id
- Processa mídia do histórico
- Limite configurável (default 100, max 500)
**Arquivos:**
- `supabase/migrations/20251220_sync_history_jobs.sql` - migration da tabela
- `apps/api/app/routers/conversations.py` - endpoint sync-history
- `apps/workers/telegram/worker.py` - _history_sync_loop, _process_history_sync_jobs
- `apps/web/src/components/inbox/chat-view.tsx` - botão sync
- `apps/web/src/components/inbox-view.tsx` - função syncHistory
