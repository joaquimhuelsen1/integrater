---
motivo: Correção de bug crítico em workflows n8n - aspas simples quebrando SQL
milestone: M5
data: 2026-01-05
area: api
impacto: alto
---

# Fix: Escape de aspas simples em workflows n8n

## Contexto
Workflows n8n (Telegram Outbound) falhando com erro:
```
Syntax error at line 1 near "s"
```

Todas as execuções do dia 04/01 estavam falhando (10+ erros consecutivos).

## Descoberta
O problema estava no nó "Insert Message (Outbound)" do workflow `kKcqwx9vbAEa9L1l`.

**Causa raiz**: Mensagens contendo aspas simples (ex: "It's", "can't", "you've") quebravam o SQL porque:

1. O campo `text` usava `.replace(/'/g, "''")` - **funcionava**
2. O campo `raw_payload` usava `JSON.stringify()` **sem escape** - **quebrava**

Exemplo de texto problemático:
```
Hi, this is Ethan.
It's a great pleasure...
```

O `JSON.stringify()` gerava:
```json
{"text":"...It's a great pleasure..."}
```

E essas aspas simples dentro do JSON quebravam o SQL ao inserir no PostgreSQL.

## Ação
Corrigido o nó "Insert Message (Outbound)" para usar o mesmo padrão do workflow Inbound:

**Antes (quebrado):**
```javascript
// text
'{{ ($('Webhook Outbound').item.json.body.content.text || '').replace(/'/g, "''") }}'

// raw_payload  
'{{ JSON.stringify($('Webhook Outbound').item.json.body.content || {}) }}'::jsonb
```

**Depois (corrigido):**
```javascript
// text (com prefixo E para escape)
E'{{ ($('Webhook Outbound').item.json.body.content.text || "").split("'").join("''") }}'

// raw_payload (com escape de aspas)
'{{ JSON.stringify($('Webhook Outbound').item.json.body.content || {}).split("'").join("''") }}'::jsonb
```

Também corrigido o nó "Update Conversation (Outbound)" com o mesmo padrão.

## Implicações

1. **Novas execuções funcionarão** - O workflow ativo já está corrigido
2. **Retries não funcionam** - n8n usa a versão original do workflow no retry
3. **Mensagens perdidas precisam ser reenviadas** - Não há como recuperar via retry

### Padrão a seguir
Sempre que inserir texto do usuário em SQL via n8n:
- Usar `.split("'").join("''")` para escapar aspas simples
- Usar prefixo `E'...'` para textos que podem ter quebras de linha
- Aplicar escape em TODOS os campos que podem conter texto do usuário (não só no campo principal)

### Workflows afetados corrigidos:
- `kKcqwx9vbAEa9L1l` - Integrater - Telegram/Outbound ✅

### Workflows que já tinham o fix:
- `EQx2y1v8lqg30dLN` - Integrater - Telegram/Inbound ✅
