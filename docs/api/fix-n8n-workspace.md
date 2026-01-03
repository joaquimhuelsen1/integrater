# Fix n8n - Filtrar por Workspace

## Problema
O node "Get Integration Account" busca por `owner_id` mas não filtra por `workspace_id`.
Resultado: mensagens enviadas para o workspace errado (ex: Sarah mistura com Ethan).

## Solução

No n8n, node **"Get Integration Account"**, trocar o SQL:

### DE (errado):
```sql
SELECT ia.id as account_id
FROM integration_accounts ia
WHERE ia.owner_id = '{{ $('Get Conversation').item.json.owner_id }}'
  AND ia.type = 'telegram_user'
  AND ia.is_active = true
LIMIT 1;
```

### PARA (correto):
```sql
SELECT ia.id as account_id
FROM integration_accounts ia
WHERE ia.workspace_id = '{{ $('Get Conversation').item.json.workspace_id }}'
  AND ia.type = 'telegram_user'
  AND ia.is_active = true
LIMIT 1;
```

## Data
2026-01-02
