# Bugs Conhecidos

Registro de bugs encontrados, status de resolução e workarounds.

---

## Status por Data

| Data | Bug | Tabelas Afetadas | Status | Severidade | Workaround |
|------|-----|------------------|--------|------------|-----------|
| 2026-01-23 | 4 mensagens com workspace_id NULL após backfill | messages | CORRIGIDO | Alta | Triggers adicionados para auto-popular |

---

## Detalhes

### Mensagens com workspace_id NULL (2026-01-23)

**Descrição**: Após o backfill de workspace_id em 34+ tabelas, 4 mensagens criadas no período de transição ficaram com workspace_id NULL.

**Causa**: Criar mensagens entre o backfill step2 e step5 (triggers não estavam ativos ainda).

**Status**: CORRIGIDO em step5

**Solução Implementada**:
- Adicionados triggers para:
  - `messages` - auto-popular workspace_id do seu conversation_id
  - `attachments` - auto-popular workspace_id do seu message_id
  - `conversation_tags` - auto-popular workspace_id do seu conversation_id
  - `message_events` - auto-popular workspace_id do seu message_id

**Workaround** (se novas instâncias aparecerem):
```sql
-- Corrigir messages orphans
UPDATE messages SET workspace_id = c.workspace_id
FROM conversations c
WHERE messages.conversation_id = c.id
AND messages.workspace_id IS NULL;

-- Corrigir attachments orphans
UPDATE attachments SET workspace_id = m.workspace_id
FROM messages m
WHERE attachments.message_id = m.id
AND attachments.workspace_id IS NULL;
```

**Monitoramento**: Verificar regularmente com trigger test queries

---

## Próximas Ações

- [P2] Adicionar filtro workspace_id em `deals.py` (sugestão tech-lead)
- [P3] Implementar log de dados NULLs para early detection

---
