# Changelog

Registro de mudanças estruturais, milestones completados e bugs corrigidos no projeto Integrate X.

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
