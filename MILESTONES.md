# Milestones - Inbox Multicanal

Este arquivo serve como passo a passo do projeto. Consulte sempre para não perder contexto.

**Status:** ⬜ Pendente | 🟡 Em Andamento | ✅ Concluído

---

## M1 — Bootstrap + Supabase + Auth ✅

**Objetivo:** Estrutura base do projeto com autenticação funcionando.

### Entregáveis
- Repositório estruturado (monorepo apps/) ✅
- Supabase configurado (migration, bucket, auth) ✅
- Frontend com login funcionando
- Backend (FastAPI) rodando com health check

### Critérios de Aceite
- [x] Logar e ver UI base
- [x] DB com tabelas e RLS ativo
- [x] `GET /health` retorna 200
- [x] Bucket `attachments` criado (privado)

### Tasks Relacionadas
- `tasks/TASKS-GERAL.md` → Setup inicial

---

## M2 — Inbox Core (sem integrações) ✅

**Objetivo:** UI completa do inbox funcionando com dados mock/seed.

### Entregáveis
- UI inbox completa (lista + chat + composer)
- CRUD contatos
- CRUD tags
- CRUD templates
- Status de conversa (open/pending/resolved)
- Busca full-text
- Anexos via Storage
- "Não vinculados" (criar/vincular contato)
- Realtime funcionando

### Critérios de Aceite
- [x] Criar contato/conversa/mensagens via seed
- [x] Navegar inbox sem bugs
- [x] Busca retorna resultados
- [x] Realtime atualiza lista ao inserir mensagem
- [x] Upload/download de anexos funciona
- [x] Tags aplicadas aparecem na lista
- [x] Templates inserem no composer

### Tasks Relacionadas
- `tasks/TASKS-WEB.md` → Componentes UI
- `tasks/TASKS-API.md` → Endpoints CRUD

---

## M3 — Telegram (end-to-end) ✅

**Objetivo:** Receber e enviar mensagens via Telegram.

### Entregáveis
- Flow de auth na UI (phone → code → 2FA) ✅
- Worker Telegram (múltiplas contas) ✅
- Sessão criptografada no banco ✅
- Receber/enviar mensagens ✅
- Health check de workers ✅

### Critérios de Aceite
- [x] Cadastrar conta Telegram pela UI
- [x] Mensagem do Telegram aparece na UI (realtime)
- [x] Resposta do sistema chega no Telegram
- [x] Status do worker visível na UI
- [x] Múltiplas contas coexistem

### Tasks Relacionadas
- `tasks/TASKS-WEB.md` → UI auth Telegram
- `tasks/TASKS-API.md` → Endpoints Telegram
- `tasks/TASKS-WORKERS.md` → Worker Telegram

---

## M4 — Tradução EN→PT ✅

**Objetivo:** Traduzir mensagens de inglês para português.

### Entregáveis
- Detecção de idioma automática ✅
- Endpoints de tradução ✅
- Cache em `message_translations` ✅
- UI toggle "Original | Português" ✅
- Botão "Traduzir conversa" (batch) ✅

### Critérios de Aceite
- [x] Traduzir mensagem individual
- [x] Traduzir conversa inteira (batch)
- [x] Ver tradução com toggle
- [x] Recarregar e tradução persiste (cache)
- [x] Mensagem já em PT não traduz

### Tasks Relacionadas
- `tasks/TASKS-WEB.md` → UI tradução
- `tasks/TASKS-API.md` → Endpoints + Gemini Flash

---

## M5 — IA Assistente ✅

**Objetivo:** Sugerir respostas e resumir conversas.

### Entregáveis
- Sugerir resposta (em inglês, para o lead) ✅
- Resumir conversa (em português, para você) ✅
- Salvar `ai_suggestions` e `ai_feedback` ✅
- UI: botões no chat ✅
- Inserir sugestão no composer ✅

### Critérios de Aceite
- [x] Sugestão gerada é útil e em inglês
- [x] Sugestão inserida no composer
- [x] Feedback gravado (accepted/rejected/edited)
- [x] Resumo em português correto
- [x] Contexto usa toda a conversa

### Tasks Relacionadas
- `tasks/TASKS-WEB.md` → UI botões IA
- `tasks/TASKS-API.md` → Endpoints + Gemini Pro

---

## M6 — Gerenciamento de Prompts ✅

**Objetivo:** Editar prompts de IA via UI.

### Entregáveis
- Página de prompts na UI ✅
- CRUD via API ✅
- Versionamento automático ✅
- Preview/test de prompt ✅

### Critérios de Aceite
- [x] Editar prompt reflete na IA
- [x] Histórico de versões visível
- [x] Reverter para versão anterior
- [x] Preview do prompt antes de salvar

### Tasks Relacionadas
- `tasks/TASKS-WEB.md` → Página prompts
- `tasks/TASKS-API.md` → CRUD prompts

---

## M7 — OpenPhone SMS ✅

**Objetivo:** Receber e enviar SMS via OpenPhone.

### Entregáveis
- Webhook inbound/status ✅
- Envio outbound via API ✅
- Múltiplos números ✅
- Anexo → link (upload + URL) ✅

### Critérios de Aceite
- [x] SMS inbound aparece na conversa
- [x] SMS outbound chega no destinatário
- [x] Múltiplos números funcionam
- [x] Anexo vira link na mensagem

### Tasks Relacionadas
- `tasks/TASKS-API.md` → Webhook + endpoints

---

## M8 — Email IMAP/SMTP ✅

**Objetivo:** Receber e enviar emails.

### Entregáveis
- Cadastro de contas na UI ✅
- Worker IMAP (idle + poll fallback) ✅
- SMTP send ✅
- Threading por headers (In-Reply-To, References) ✅
- Test de conexao IMAP/SMTP ✅
- Anexos (via PRD - links)

### Critérios de Aceite
- [x] Cadastrar conta email pela UI
- [x] Email inbound aparece na conversa correta (thread)
- [x] Email outbound chega no destinatário
- [x] Anexos via links (mesmo padrao SMS)
- [x] Test de conexao na UI

### Tasks Relacionadas
- `tasks/TASKS-WEB.md` → UI auth Email
- `tasks/TASKS-API.md` → Endpoints Email
- `tasks/TASKS-WORKERS.md` → Worker Email

---

## M9 — Logs + Export + Polish ✅

**Objetivo:** Finalizar com logs, export e polish.

### Entregáveis
- UI de logs (filtros, busca) ✅
- Export JSON/CSV ✅
- Bug fixes ✅
- Performance tuning ✅

### Critérios de Aceite
- [x] Logs ajudam debug (filtrar por nível, buscar)
- [x] Export JSON funciona
- [x] Export CSV funciona
- [x] App estável sem bugs críticos
- [x] Performance aceitável

### Tasks Relacionadas
- `tasks/TASKS-WEB.md` → UI logs/export
- `tasks/TASKS-API.md` → Endpoints logs/export

---

## Resumo de Progresso

| Milestone | Status | Progresso |
|-----------|--------|-----------|
| M1 Bootstrap | ✅ | 4/4 |
| M2 Inbox Core | ✅ | 7/7 |
| M3 Telegram | ✅ | 5/5 |
| M4 Tradução | ✅ | 5/5 |
| M5 IA Assistente | ✅ | 5/5 |
| M6 Prompts | ✅ | 4/4 |
| M7 SMS | ✅ | 4/4 |
| M8 Email | ✅ | 5/5 |
| M9 Polish | ✅ | 5/5 |

**Total:** 44/44 critérios concluídos

---

## Dependências entre Milestones

```
M1 Bootstrap
    ↓
M2 Inbox Core
    ↓
    ├─→ M3 Telegram ──→ M4 Tradução ──→ M5 IA
    │                                    ↓
    │                               M6 Prompts
    │
    ├─→ M7 SMS
    │
    └─→ M8 Email
           ↓
        M9 Polish (após todos)
```

**Ordem recomendada:** M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9
