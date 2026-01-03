# Tasks - API (Backend)

Tarefas relacionadas ao backend FastAPI (apps/api).

## Pendentes

<!-- Adicionar tarefas pendentes aqui -->

## Em Andamento

<!-- Tarefas sendo trabalhadas -->

## Concluídas

#### [API-001] Implementar health router ✅
**Data:** 2025-12-19
**Resultado:** GET /health retorna {"status": "ok"} - já existia no main.py
**Arquivo:** `apps/api/app/main.py:20`

#### [API-002] Implementar routers CRUD M2 ✅
**Data:** 2025-12-19
**Resultado:** Routers contacts, conversations, messages, tags, templates, storage
**Arquivos:**
- `apps/api/app/routers/contacts.py`
- `apps/api/app/routers/conversations.py`
- `apps/api/app/routers/messages.py`
- `apps/api/app/routers/tags.py`
- `apps/api/app/routers/templates.py`
- `apps/api/app/routers/storage.py`

#### [API-003] Implementar router Telegram auth ✅
**Data:** 2025-12-20
**Resultado:** Endpoints para auth Telegram (phone → code → 2FA)
**Endpoints:**
- POST /telegram/auth/start - envia código SMS
- POST /telegram/auth/verify-code - verifica código
- POST /telegram/auth/verify-2fa - verifica senha 2FA
- GET /telegram/accounts - lista contas
- DELETE /telegram/accounts/{id} - remove conta
- GET /telegram/workers/status - status dos workers
**Arquivos:**
- `apps/api/app/routers/telegram.py` - router completo
- `apps/api/app/config.py` - adicionado TELEGRAM_API_ID/HASH
- `apps/api/requirements.txt` - adicionado telethon

#### [API-004] Implementar tradução Gemini (M4) ✅
**Data:** 2025-12-20
**Resultado:** Endpoints de tradução com Gemini 3 Flash
**Endpoints:**
- POST /translate/message/{id} - traduz mensagem individual
- GET /translate/message/{id} - busca tradução em cache
- POST /translate/conversation/{id} - traduz conversa inteira (batch)
**Arquivos:**
- `apps/api/app/services/gemini.py` - serviço Gemini (tradução, sugestão, resumo)
- `apps/api/app/routers/translate.py` - router de tradução
- `apps/api/app/config.py` - modelos Gemini 3 Flash/Pro

#### [API-005] Migrar para novo SDK Google GenAI ✅
**Data:** 2025-12-20
**Resultado:** Substituída lib depreciada google-generativeai pelo novo google-genai
**Mudanças:**
- `requirements.txt` - google-generativeai → google-genai>=1.56.0
- `gemini.py` - novo padrão Client + generate_content via asyncio.to_thread
- Atualizadas todas versões para últimas estáveis
**Versões finais:**
- fastapi: 0.125.0
- uvicorn: 0.38.0
- pydantic: 2.12.5
- supabase: 2.27.0
- telethon: 1.42.0
- cryptography: 46.0.3
- google-genai: 1.56.0

#### [API-006] Implementar IA Assistente (M5) ✅
**Data:** 2025-12-20
**Resultado:** Endpoints de sugestão/resumo com Gemini Pro
**Endpoints:**
- POST /ai/conversation/{id}/suggest - sugestão de resposta (inglês)
- POST /ai/conversation/{id}/summarize - resumo da conversa (português)
- POST /ai/suggestion/{id}/feedback - registrar feedback (accepted/rejected/edited)
- GET /ai/conversation/{id}/suggestions - listar sugestões anteriores
**Arquivos:**
- `apps/api/app/routers/ai.py` - router de IA

#### [API-007] Implementar sync histórico Telegram ✅
**Data:** 2025-12-21
**Resultado:** Endpoint para forçar sync de mensagens Telegram
**Contexto:** Usuário queria puxar mensagens antigas quando worker fica offline
**Endpoints:**
- POST /telegram/sync-history - cria jobs de sync (período: 1d/3d/7d)
- GET /telegram/sync-history/status - lista status dos jobs
**Arquivos:**
- `apps/api/app/routers/telegram.py:280-342` - endpoints sync
- `apps/api/app/models/integrations.py:99-115` - modelos Pydantic
- `apps/web/src/components/settings-view.tsx` - UI com botões sync

#### [API-008] Integrar envio Telegram via Worker HTTP ✅
**Data:** 2026-01-02
**Contexto:** Frontend enviava mensagens mas não chegavam no Telegram. Loop de outbound foi removido do worker para usar n8n.
**Resultado:** API agora chama Worker HTTP diretamente para enviar mensagens Telegram
**Fluxo:**
1. Frontend chama POST /messages/send
2. API insere mensagem no banco
3. API chama Worker HTTP (http://telegram-worker:8001/send)
4. Worker envia via Telethon
5. API atualiza external_message_id com telegram_msg_id
**Arquivos:**
- `apps/api/app/routers/messages.py:130-197` - lógica de envio Telegram
- `apps/api/.env.example` - variáveis TELEGRAM_WORKER_URL e WORKER_API_KEY

#### [API-009] Sincronização de Contatos OpenPhone ✅
**Data:** 2026-01-03
**Contexto:** OpenPhone não envia nome do contato nos webhooks, apenas telefone. Precisamos sincronizar contatos para exibir nomes no inbox.
**Resultado:** Endpoint POST /openphone/contacts/sync que:
1. Busca conta OpenPhone e valida ownership
2. Chama GET https://api.openphone.com/v1/contacts
3. Para cada contato, atualiza metadata.display_name na contact_identities correspondente
**Endpoints:**
- POST /openphone/contacts/sync - sincroniza contatos (params: account_id, workspace_id)
**Response:** { synced: int, skipped: int, errors: int }
**Arquivos:**
- `apps/api/app/routers/openphone.py:283-398` - endpoint sync
**Referências:**
- Anotação: `docs/api/anotacao-openphone-contacts-sync-2026-01-03.md`
