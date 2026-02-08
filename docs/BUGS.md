# Bugs Conhecidos

Registro de bugs encontrados, status de resolução e workarounds.

---

## Status por Data

| Data | Bug | Tabelas Afetadas | Status | Severidade | Workaround |
|------|-----|------------------|--------|------------|-----------|
| 2026-02-08 | IDOR em GET /conversations/{id} - sem filtro owner_id | conversations | CORRIGIDO | Alta | Filtro owner_id adicionado em query |
| 2026-02-08 | Queries redundantes ao carregar conversations | conversations | CORRIGIDO | Média | Consolidadas em 1 SELECT com JOINs |
| 2026-02-08 | N8N_INSTRUCTIONS_WEBHOOK_URL não validada | instructions | CORRIGIDO | Média | Trata ausência como error 500 |
| 2026-01-23 | 4 mensagens com workspace_id NULL após backfill | messages | CORRIGIDO | Alta | Triggers adicionados para auto-popular |

---

## Detalhes

### IDOR em GET /conversations/{id} (2026-02-08)

**Descrição**: Endpoint GET /conversations/{conversation_id} não validava se o usuário era owner da conversation, permitindo acesso a dados de outros usuários.

**Causa**: Query faltava filtro `WHERE owner_id = current_user_id` após autenticação.

**Status**: CORRIGIDO em M2

**Severidade**: ALTA (security issue)

**Solução Implementada**:
- Adicionado filtro owner_id em instruction router: `WHERE conversations.workspace_id = (SELECT id FROM workspaces WHERE owner_id = auth.uid())`
- Consolidado com query de conversations existentes em conversations.py

**Monitoramento**: Verificar logs de requisições suspeitas em app_logs

---

### Queries Redundantes em Conversations (2026-02-08)

**Descrição**: Frontend chamava 2 queries separadas para carregar uma conversa: uma para dados e outra para contexto/instruções.

**Causa**: Arquitetura de endpoints não consolidava os JOINs necessários.

**Status**: CORRIGIDO em M2

**Severidade**: MÉDIA (performance)

**Solução Implementada**:
- Consolidadas em 1 SELECT com JOINs para instructions, messages count, etc.
- Redução estimada: ~30-40% nas requisições de carregamento de conversa

---

### N8N_INSTRUCTIONS_WEBHOOK_URL Não Validada (2026-02-08)

**Descrição**: Se N8N_INSTRUCTIONS_WEBHOOK_URL não estava configurada no .env, a API tentava enviar webhook para URL None, causando erro genérico.

**Causa**: Falta de validação no startup do FastAPI e no handler do endpoint.

**Status**: CORRIGIDO em M2

**Severidade**: MÉDIA (operational)

**Solução Implementada**:
- Adicionada validação no instructions.py: se webhook URL está None, retorna HTTP 500 com mensagem "N8N_INSTRUCTIONS_WEBHOOK_URL not configured"
- Adicionar .env.example com placeholder: `N8N_INSTRUCTIONS_WEBHOOK_URL=https://n8n.example.com/webhook/...`

**Workaround** (até workflow n8n ser criado):
```bash
# .env
N8N_INSTRUCTIONS_WEBHOOK_URL=http://localhost:5678/webhook/instructions
```

---

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
