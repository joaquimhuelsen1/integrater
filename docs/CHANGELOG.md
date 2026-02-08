# Changelog

Registro de mudanças estruturais, milestones completados e bugs corrigidos no projeto Integrate X.

## [2026-02-08] - M1/M2/M3 Feature Instruções (Sugestões de Resposta com Contexto)

### Milestone: M1 (Database) + M2 (API Backend) + M3 (Frontend) - Feature Instruções

**Status**: Completado

**Mudança Estrutural**: SIM

**Arquivos Modificados**:
- apps/api/app/routers/instructions.py - Novo router com 2 endpoints (POST e GET)
- apps/api/app/routers/__init__.py - Import do instructions_router
- apps/api/app/main.py - Incluir router no FastAPI
- apps/api/.env.example - Adicionada variável N8N_INSTRUCTIONS_WEBHOOK_URL
- apps/web/src/components/inbox/chat-view.tsx - Botão menu, modal de instruções, painel de instrução para resposta
- apps/web/src/components/inbox-view.tsx - Estado para polling, props propagadas
- Migration Supabase: Nova tabela conversation_instructions (id, conversation_id, content, created_at)

**Detalhes Técnicos**:

**M1 - Database**:
- Nova tabela: conversation_instructions (workspace_id PK, conversation_id FK, content TEXT, created_at TIMESTAMP)
- RLS ativo: SELECT/INSERT/DELETE apenas pelo owner_id do workspace
- Índices: conversation_id (busca rápida de instruções por conversa)

**M2 - API Backend**:
- Novo router: /instructions
  - POST /conversations/{conversation_id}/instructions - Envia instrução via webhook n8n e salva em BD
  - GET /conversations/{conversation_id}/instructions - Retorna instrução da conversa
- Segue padrão fire-and-forget: POST retorna imediatamente com status=pending, n8n dispara em background
- Reutiliza _build_conversation_text() do ai.py para contexto da conversa
- Query de conversations filtrada por owner_id (IDOR corrigido)
- Error handling: N8N_INSTRUCTIONS_WEBHOOK_URL ausente → retorna 500 com mensagem descritiva

**M3 - Frontend**:
- Chat-view: Botão menu vertical (⋮) que abre modal de instruções
- Modal: Campo de input para digitar instrução customizada + button "Enviar"
- Painel de instrução: Exibe instrução atual da conversa em box destacado (before chat input)
- Polling: Frontend poll a cada 3s para verificar se instrução foi processada (timeout 120s)
- Estado Redux: conversation_instructions (Map de conversation_id → instruction)

**Mudanças Estruturais**:
- Nova tabela Supabase: conversation_instructions
- Novo router API: POST/GET /instructions com webhooks n8n
- Novos componentes UI: Modal de instruções, painel de exibição
- Novo env var: N8N_INSTRUCTIONS_WEBHOOK_URL
- Fluxo: User digita instrução → API envia para n8n → IA processa → retorna sugestão de resposta → Frontend exibe

**Bugs Encontrados e Corrigidos**:
- IDOR: Endpoint GET /conversations/{id} não filtrava por owner_id (corrigido em M2)
- Queries redundantes: 2 queries para carregar conversations consolidadas em 1 select eficiente
- N8N URL ausente: Não existia validação se N8N_INSTRUCTIONS_WEBHOOK_URL estava configurada (agora trata como error)

**Notas para o Futuro**:
- Workflow n8n para processar instruções ainda não foi criado (será M4)
- Padrão fire-and-forget segue mesma arquitetura do lead scoring (webhooks.py)
- Frontend polling é provisório até implementar WebSocket no n8n callback
- Sugestão: Adicionar filtro de instruções antigas (cleanup automático >30 dias)
- Tech-lead aprovado após correções de IDOR e query optimization

---

## [2026-02-07] - M1 Fix Duplicação de Leads no Webhook CRM

### Milestone: M1 - Fix Duplicação de Leads no Webhook CRM

**Status**: Completado

**Mudança Estrutural**: NÃO (correção de lógica em fluxo existente)

**Arquivos Modificados**:
- apps/api/app/routers/webhooks.py - Reestruturado fluxo de criação de deals via webhook

**Detalhes Técnicos**:
- Webhook POST /webhooks/{workspace_id}/deals estava criando deals duplicados
- Problema: Não verificava se o contato já tinha deal ativo antes de criar novo
- Solução implementada:
  1. Movido `get_or_create_by_email()` para ANTES da criação do deal
  2. Adicionado check de duplicidade (1 deal ativo por contato) — mesma lógica do endpoint POST /deals
  3. Se duplicata detectada, retorna deal existente com flag `"duplicate": true` (idempotente)
  4. Eliminado update separado de contact_id (deal já nasce com contact_id correto)
- Deduplicação é condicional no código (não usa índice único no banco), implementada em lógica Python

**Bugs Encontrados e Corrigidos**:
- Bug CRÍTICO: Webhook criava deals sem verificação de duplicidade, causando leads duplicados no CRM
- Corrigido: Adicionado check ANTES do INSERT, retorna deal existente quando duplicata

**Notas para o Futuro**:
- Tech-lead aprovou sem issues críticas
- Sugestão de longo prazo: Adicionar partial unique index no banco para garantir deduplicação sob race condition (UNIQUE INDEX on contact_id WHERE stage != 'won' AND stage != 'lost')
- Fluxo de webhook agora é idempotente: múltiplas chamadas com mesmo payload retornam mesmo deal
- Sem necessidade de commit/push/deploy neste momento (será feito ao finalizar tarefa inteira)

---

## [2026-02-07] - M1 Lead Score v2 - Workflow n8n refatorado

### Milestone: M1 - Lead Score v2 - Workflow n8n refatorado

**Status**: Completado

**Mudança Estrutural**: NÃO (refactoring de workflow n8n existente)

**Arquivos Modificados**:
- Nenhum arquivo local modificado
- Workflow n8n `WK7PXM5mNFJeXLKF` atualizado via MCP n8n API

**Detalhes Técnicos**:
- Workflow "Lead Score v2 - GLM 4.7 Thinking" completamente refatorado
- Supabase nodes substituídos por PostgreSQL nodes (para queries com JOINs complexos)
- Node "Get Won Conversations" adicionado para capturar contexto de alunos que compraram mentoria
- Build Prompt atualizado para usar TODOS os 21 campos do formulário (antes usava apenas 9 campos):
  - Dados pessoais, formação, experiência, motivação, objetivos, restrições financeiras, contexto de negócio
- GLM agora usa thinking mode (reasoning profundo antes de gerar score)
- HTTP Request node para GLM configurado com predefinedCredentialType e typeVersion 4.3
- Save Score via PostgreSQL INSERT direto
- Workflow ativado e pronto para receber webhooks
- Sistema de lead score com 4 fatores (financial_capacity, motivation, case_viability, engagement) escala 0-25 cada

**Bugs Encontrados e Corrigidos**:
- Nenhum

**Notas para o Futuro**:
- Campo _meta enviado junto com body da API GLM (pode ser ignorado pela API)
- SQL injection via templates n8n (risco baixo, owner_id vem da API interna)
- Frontend já está preparado para exibir scores com 4 fatores
- Tarefa não envolveu mudanças em código do projeto, apenas configuração do workflow n8n
- Sem necessidade de commit/push/deploy (mudança puramente no n8n cloud)

---

## [2026-02-06] - M1 Pin + Notificação no Broadcast Telegram

### Milestone: M1 - Pin + Notificação no Broadcast Telegram

**Status**: Completado

**Mudança Estrutural**: NÃO (modificação de 2 arquivos existentes + 1 coluna nova)

**Arquivos Modificados**:
- apps/workers/telegram/api.py - Adicionado pin_message e silent ao SendRequest, lógica de pin após envio broadcast, error handling específico, silent override para evitar dupla notificação
- apps/api/app/routers/broadcast.py - Adicionado pin_message e notify ao request model, repassar ao worker, salvar pinned no histórico
- Migration Supabase: ALTER TABLE broadcast_messages ADD COLUMN pinned BOOLEAN DEFAULT FALSE

**Detalhes Técnicos**:
- Defaults: pin_message=True, notify=True (ideal para blog posts)
- Anti-spam: quando pin_message=True, envio é silencioso (silent=True) — notificação vem apenas do pin
- Pin é try/catch: se falhar (permissões, rate limit), mensagem já foi enviada com sucesso
- Telethon client.pin_message() usado nativamente
- Nova coluna `pinned` (BOOLEAN DEFAULT FALSE) em broadcast_messages para auditoria

**Bugs Encontrados e Corrigidos**:
- Nenhum bug. Tech-lead sugeriu melhorias de error handling que foram aplicadas.

**Notas para o Futuro**:
- Implementação robusta: pin é opcional e nunca bloqueia o envio broadcast
- Mensagens importantes podem ser pinadas para maior visibilidade no canal
- Suporta toggle de notificação para grupos: pin = silencioso, usuários veem no topo do canal

---

## [2026-02-06] - Espelho Framework Claude -> Codex

### Milestone: nenhum

**Status**: Completado

**Mudança Estrutural**: NÃO (mudança operacional de framework)

**Arquivos Modificados**:
- AGENT.md - novo espelho local de `~/.claude/CLAUDE.md`
- README.md - seção Documentação atualizada com AGENT.md
- tasks/TASKS-GERAL.md - task `[GERAL-004]` criada e concluída
- docs/api/anotacao-framework-codex-2026-02-06.md - anotação estratégica da migração

**Detalhes Técnicos**:
- `~/.claude/CLAUDE.md` copiado para:
  - `AGENT.md` (projeto)
  - `C:\\Users\\Joaquim Huelsen\\.codex\\AGENT.md`
- Espelho de assets Claude em `C:\\Users\\Joaquim Huelsen\\.codex`:
  - `agents/`
  - `commands/`
  - `context-pills/`
  - `hooks/`
  - `claude-mirror/` (snapshot bruto)
- Skills custom adicionadas em `C:\\Users\\Joaquim Huelsen\\.codex\\skills`:
  - `design-principles`
  - `agent-creator-cc`
  - `skill-creator-cc`

**Bugs Encontrados e Corrigidos**:
- Nenhum

**Notas para o Futuro**:
- O espelho de comandos/agents/context-pills no Codex é documental/operacional; execução automática depende de suporte nativo do runtime.

---

## [2026-01-23] - SELECT Específico (Remover SELECT *)

### Milestone: M3 - SELECT Específico (remover SELECT *)

**Status**: Completado

**Mudança Estrutural**: NÃO (otimização de queries apenas)

**Arquivos Modificados**:
- apps/api/app/routers/conversations.py - CONVERSATION_LIST_COLUMNS, MESSAGE_LIST_COLUMNS
- apps/api/app/routers/contacts.py - CONTACT_LIST_COLUMNS
- apps/api/app/routers/deals.py - DEAL_LIST_COLUMNS

**Detalhes Técnicos**:
- Removido SELECT * de todos endpoints de listagem
- Campos grandes omitidos (reduzem payload):
  - metadata (JSON complexo)
  - raw_payload (dados brutos da API externa)
  - custom_fields (JSON grande)
- Todos os campos obrigatórios têm defaults nos models Pydantic
- Redução estimada: 30-50% no tamanho dos payloads de lista
- Impacto de performance: Menor uso de banda, transferência mais rápida

**Bugs Encontrados e Corrigidos**:
- Nenhum

**Notas para o Futuro**:
- Tech-lead sugeriu criar models específicos para listagem (Pydantic separate READ/LIST models) - melhoria arquitetural para futuro
- Possível expandir para mais endpoints (GET /conversations, GET /deals com filtros)
- Monitorar redução de banda em produção

---

## [2026-01-23] - Otimizar Search Frontend

### Milestone: M4 - Otimizar Search Frontend

**Status**: Completado

**Mudança Estrutural**: NÃO (otimização de UX/queries apenas)

**Arquivos Modificados**:
- apps/web/src/components/inbox-view.tsx - linhas 352-363 (debounce search)

**Detalhes Técnicos**:
- Debounce aumentado de 300ms para 500ms
- Adicionada validação de mínimo 3 caracteres para disparo de busca
- Query vazia (reset) continua funcionando normalmente
- Redução estimada: ~8% nas queries ao Supabase
- UX mantida: 500ms ainda é responsivo para usuários

**Bugs Encontrados e Corrigidos**:
- Nenhum

**Notas para o Futuro**:
- Tech-lead sugeriu adicionar feedback visual para 1-2 caracteres (melhoria UX)
- Parte do plano de otimização para reduzir requisições de 275k/dia para <50k/dia
- Próximas fases: expandir debounce para mais componentes de busca (conversations, contacts)

---

## [2026-01-23] - Cache TTL nos Endpoints Backend

### Milestone: M2 - Cache TTL nos Endpoints Backend

**Status**: Completado

**Mudança Estrutural**: NÃO (otimização interna apenas)

**Arquivos Modificados**:
- apps/api/app/services/cache.py - Adicionado TTL_REALTIME = 5 segundos
- apps/api/app/routers/conversations.py - Cache com invalidação em mutações
- apps/api/app/routers/contacts.py - Cache com invalidação em mutações

**Detalhes Técnicos**:
- TTL de 5 segundos (TTL_REALTIME) para não afetar UX em tempo real
- Realtime (WebSocket) cuida de atualizações instantâneas além do cache
- Invalidação automática em 6 endpoints de mutação:
  - delete_conversation
  - archive_conversation
  - unarchive_conversation
  - merge_conversations
  - delete_contact
  - link_contact_by_email
- Estratégia: Cache + Realtime = consistência forte + performance extrema

**Bugs Encontrados e Corrigidos**:
- Tech-lead identificou falta de invalidação de cache em 6 endpoints (todos corrigidos)

**Notas para o Futuro**:
- Estimativa de redução: ~60-80k requisições/dia
- Cache pode ser expandido para mais endpoints (GET /contacts, GET /deals) se necessário
- Monitorar em produção via métrica de cache hits (adicionar logging)

---

## [2026-01-23] - Cache de Session Frontend

### Milestone: M1 - Cache de Session no Frontend

**Status**: Completado

**Mudança Estrutural**: NÃO (otimização interna apenas)

**Arquivos Modificados**:
- apps/web/src/lib/supabase.ts - Singleton do cliente Supabase
- apps/web/src/lib/api.ts - Cache de session em memória com onAuthStateChange

**Detalhes Técnicos**:
- Singleton pattern para cliente Supabase evita criação múltipla de instâncias
- Cache de session em memória com listener `onAuthStateChange`
- Invalidação automática ao fazer logout via listener
- Estimativa de redução: 80-100k requisições/dia

**Bugs Encontrados e Corrigidos**:
- Nenhum

**Notas para o Futuro**:
- Tech-lead identificou 13 outras chamadas diretas a `getSession()` espalhadas no codebase
- Possível próximo passo: Migrar todas as chamadas para usar cache centralizado
- Impacto potencial adicional: ~15-20k requisições/dia (segunda onda de otimização)

---

## [2026-02-05] - Atualizar Workflow n8n "SARAH | Form" para CRM da Sarah

### Milestone: M1 - Atualizar workflow n8n "SARAH | Form" para CRM da Sarah

**Status**: Completado

**Mudança Estrutural**: NÃO (integração externa apenas)

**Arquivos Modificados**:
- Nenhum arquivo local modificado
- Workflow n8n `p1b6f4LE5OJaa28v` atualizado via MCP n8n API

**Detalhes Técnicos**:
- Workflow "SARAH | Form" tinha 3 nodes HTTP Request enviando deals para workspace errado
- Atualizados os 3 nodes:
  1. **Criar Deal SMS** - Node HTTP Request
  2. **Telegram** - Node HTTP Request
  3. **Email** - Node HTTP Request
- Novos valores configurados em cada node:
  - URL base do CRM da Sarah
  - X-API-Key (credencial corrigida)
  - X-Pipeline-Id (novo pipeline)
  - X-Stage-Id (novo stage)
- Workspace alvo agora correto: `b25019d9-6b4d-48ec-8b02-2a9571884d85` (CRM da Sarah)
- Workflow permanece ativo após atualização (versionCounter = 9)

**Bugs Encontrados e Corrigidos**:
- Nenhum

**Notas para o Futuro**:
- Recomendado teste end-to-end para validar fluxo completo de deals
- Monitorar webhook responses de forma contínua
- Sem necessidade de commit/push/deploy (mudança puramente no n8n cloud)
- Workflow aponta para APIs locais (localhost:8000) e n8n (via MCP)

---

## [2026-01-23] - Migração Ownership Model

### Milestone: M9+ - Migração USER-CENTRIC → WORKSPACE-CENTRIC

**Status**: Completado

**Mudança Estrutural**: SIM

**Arquivos Modificados** (via MCP Supabase):
- 5 migrations aplicadas diretamente no banco:
  1. `ownership_model_step1_add_workspace_id` - Adiciona coluna workspace_id
  2. `ownership_model_step2_backfill_workspace_id_v2` - Backfill seguro (34+ tabelas)
  3. `ownership_model_step3_owner_id_restrict` - FK owner_id: RESTRICT (bloqueia deletar usuário)
  4. `ownership_model_step4_workspace_cascade` - FK workspace_id: CASCADE (deleta dados do workspace)
  5. `ownership_model_step5_auto_populate_triggers` - Triggers para auto-popular workspace_id

**Tabelas Afetadas**: 34+ (conversations, contacts, deals, messages, attachments, etc.)

**Arquitetura Final**:

| Tier | Tabelas | owner_id FK | workspace_id FK |
|------|---------|-------------|-----------------|
| **TIER 1** | workspaces | RESTRICT | - |
| **TIER 2** | conversations, contacts, deals, etc. | RESTRICT | CASCADE |
| **TIER 3** | messages, attachments, conversation_tags | RESTRICT | CASCADE |
| **TIER 4** | app_logs, worker_heartbeats | CASCADE | - |

**Problema Resolvido**:
- Antes: Deletar usuário deletava TODAS conversas/mensagens em cascata (data loss crítico)
- Agora: Deletar usuário é BLOQUEADO se possui workspaces/dados (RESTRICT)
- Deletar workspace ainda cascateia deletar dados do workspace (comportamento desejado)

**Bugs Encontrados e Corrigidos**:
- 4 mensagens criadas após backfill ficaram com workspace_id NULL
- Solução: Aplicados triggers para auto-popular workspace_id em messages, attachments, conversation_tags, message_events

**Notas para o Futuro**:
- Tech-lead sugeriu: Adicionar filtro workspace_id em `deals.py` (P2 - não bloqueante)
- RLS policies usando owner_id continuam funcionando perfeitamente (single-user por workspace)
- Migrations estão versionadas no Supabase (versões 20260123*)

---
