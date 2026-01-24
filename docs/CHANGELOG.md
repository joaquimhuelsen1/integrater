# Changelog

Registro de mudanças estruturais, milestones completados e bugs corrigidos no projeto Integrate X.

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
