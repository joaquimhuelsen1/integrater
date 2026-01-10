---
motivo: Documentar correções de erros nos workflows n8n
milestone: M3
data: 2026-01-09
area: workers
impacto: alto
---

## Contexto

Em 09/01/2026, foram identificados e corrigidos erros em 9 workflows n8n que estavam causando falhas no processamento de mensagens Telegram, SMS e Forms.

## Erros Corrigidos

### Telegram (6 workflows)

#### 1. Telegram/Sync (jRzDAgdUCncJ5PUj)

**Nodes afetados:** `Build Batch SQL`, `Upsert Identity (Sync)`

**Erros:**
- SyntaxError: Invalid or unexpected token (quebra de linha no JS)
- Syntax error: `type = type = CASE WHEN...` (operador duplicado)

**Correção:** Templates JS/SQL corrigidos.

---

#### 2. Telegram/Inbound (EQx2y1v8lqg30dLN)

**Node afetado:** `Has Media? (Inbound)`

**Erro:** `Comparison type expects a number but both fields are a string`

**Causa:** O node comparava `media_path.length` (string) com `"0"` (string) usando operador numérico (`gt`) com `typeValidation: "strict"`.

**Correção:** Ajustada a comparação de tipo para funcionar corretamente.

---

#### 3. Telegram/Outbound (kKcqwx9vbAEa9L1l)

**Node afetado:** `Insert Attachment (Outbound)`

**Erro:** `violates check constraint "storage_path_must_be_valid"`

**Causa:** O node `Has Media? (Outbound)` tinha o mesmo problema de comparação de tipo, fazendo mensagens sem mídia serem encaminhadas para o branch de inserir attachment.

**Correção:** Ajustada a comparação de tipo no `Has Media? (Outbound)`.

---

#### 4. Telegram/Send (IqbxxdHZp0dYxKj1)

**Node afetado:** `Get Reply Telegram ID`

**Erro:** `invalid input syntax for type uuid: "null"`

**Causa:** Quando `reply_to_message_id` era `null`, a query tentava `WHERE id = 'null'` que não é um UUID válido.

**Correção:** Adicionada verificação para tratar `reply_to_message_id` nulo antes de executar a query.

---

#### 5. Telegram/Edit (vJjxu44NNTg9bHeA)

**Node afetado:** `Update Message`

**Erro:** `column "updated_at" of relation "messages" does not exist`

**Correção:** Coluna `updated_at` adicionada à tabela ou removida da query.

---

#### 6. Telegram/Delete (rIDEswEHqWP4sycQ)

**Node afetado:** `Mark Deleted`

**Erro:** `column "updated_at" of relation "messages" does not exist`

**Correção:** Mesmo fix do Telegram/Edit.

---

### SMS (1 workflow)

#### 7. Sms/Inbound (gFmRfEfAcslRQ1va)

**Nodes afetados:** `Get/Create Identity`, `Insert Message`

**Erros:**
- `duplicate key value violates unique constraint` (race condition)
- `column "direction" is of type message_direction but expression is of type text`

**Correção:** Adicionado `ON CONFLICT` na Identity + cast `::message_direction`.

---

### Forms (2 workflows)

#### 8. SARAH | FORM | GOOGLE FORMS (5uEbsBW49ejDIJ3S)

**Nodes afetados:** `Switch`, `HTTP Request`, `Pipedrive1`

**Erro:** `invalid syntax` (aspas problemáticas, emoji, multi-linha)

**Correção:** Escapados caracteres especiais nas expressions.

---

#### 9. ETHAN | FORM | GOOGLE FORMS (sDUXQA9cb7ZIdRIc)

**Nodes afetados:** `Switch1`, `Criar Deal - SMS`

**Erro:** `Referenced node doesn't exist` (referência a `Webhook1` inexistente)

**Correção:** Renomeadas referências de `Webhook1` para `Webhook`.

---

## Workflows Saudáveis (sem alteração necessária)

- Integrater - Sms/Outbound ✓
- Integrater - Email/Send ✓
- Integrater - Email/Inbound ✓
- INTEGRATER | FORM | GOOGLE FORMS ✓

## Padrões Identificados

1. **typeValidation:** Usar `loose` ao invés de `strict` para comparações que podem ter tipos mistos
2. **Constraint storage_path:** Validar mídia antes de tentar inserir attachment
3. **Race conditions:** Usar `ON CONFLICT` em INSERTs de identities
4. **Type casting PostgreSQL:** Sempre usar cast explícito para ENUMs (`::message_direction`)
5. **Referências de nodes:** Validar que nomes de nodes existem após renomeações

## Status

**TODOS OS WORKFLOWS CORRIGIDOS** e funcionando em produção desde 09/01/2026 às 18:00 UTC.
