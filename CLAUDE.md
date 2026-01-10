# CLAUDE.md - Integrate X

## REGRAS OBRIGATÓRIAS (NUNCA IGNORAR)

### Portas Fixas (NÃO ALTERAR)
- **API:** localhost:8000
- **Web:** localhost:3000
- **Workers:** rodam em background sem porta exposta

Se porta ocupada: **MATAR O PROCESSO** antes de iniciar. Nunca usar porta alternativa.

### Documentação de TODA alteração
**OBRIGATÓRIO** documentar QUALQUER alteração de código:
1. **Anotação em `docs/`** - se descoberta relevante ou bug corrigido
2. **Atualizar `README.md`** - se nova feature ou mudança de comportamento
3. **Atualizar `tasks/TASKS-*.md`** - registrar tarefa concluída
4. **Atualizar `MILESTONES.md`** - marcar checkbox se critério de aceite concluído

### Deploy Frontend (Vercel)
**OBRIGATÓRIO** após push para `main`:
1. Aguardar ~1 minuto para build iniciar
2. Verificar status em https://vercel.com/joaquimhuelsens-projects/integrater/deployments
3. Se build falhar (geralmente erro TypeScript), corrigir e fazer novo push
4. Só considerar deploy concluído quando status for "Ready"

---

## ARQUITETURA

### Princípios Gerais

- **Linguagem:** Toda a comunicação, código, comentários e documentação devem ser em **Português do Brasil**.
- **Objetivo Principal:** Inbox multicanal (Telegram + Email + SMS) para centralizar atendimento comercial. Simplicidade e funcionalidade são mais importantes que otimizações complexas.

### Deploy (Produção)
- **Frontend:** Vercel - https://integrater.vercel.app
- **Backend/API:** Digital Ocean Droplet - https://api.thereconquestmap.com
- **Workers:** Docker containers no mesmo Droplet
- **Banco:** Supabase (rzdqsvvkzfirvgimmzpr)

### Stack
- **Frontend:** Next.js 14 + TypeScript + Tailwind + shadcn/ui (Vercel)
- **Backend:** Python 3.11+ + FastAPI + Docker (Digital Ocean Droplet)
- **Workers:** Python (Telethon para Telegram, imapclient para Email) em Docker
- **DB/Realtime/Storage/Auth:** Supabase
- **IA:** Gemini 3 Flash (tradução) + Gemini 3 Pro (sugestão/resumo)
- **SMS:** OpenPhone API (webhooks inbound/status)

### Webhooks OpenPhone
- `message.received` → `/openphone/webhook/inbound` (SMS recebido)
- `message.delivered` → `/openphone/webhook/status` (SMS enviado)

### Estrutura Monorepo
```
apps/
├── web/          # Next.js frontend
├── api/          # FastAPI backend
└── workers/      # Telegram/Email workers
    ├── telegram/
    ├── email/
    └── shared/
```

### Padrões Críticos
- **Secrets:** Sempre criptografados com AES-256-GCM (nunca plaintext)
- **RLS:** Habilitado em TODAS as tabelas do Supabase
- **TypeScript:** Strict mode, proibido `any`
- **API:** Tipos gerados via OpenAPI (`openapi-typescript`)

### Ambiente de Desenvolvimento

**Frontend (apps/web)**
```bash
cd apps/web
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # verificar tipos
npm run lint         # verificar código
```

**Backend (apps/api)**
```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**API Local via Docker (Recomendado)**

Para rodar apenas a API localmente (sem workers):

```bash
# Na raiz do projeto
docker-compose up api -d --build

# Verificar status
docker ps -a --filter "name=inbox-api"

# Ver logs
docker logs -f inbox-api

# Parar
docker-compose down
```

Atualizar `apps/web/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Workers - APENAS NO SERVIDOR**

**NÃO RODE WORKERS LOCALMENTE!** Eles rodam apenas no servidor de produção.

**Motivo:** Telegram só permite 1 sessão por API ID. Rodar local + servidor causa `AuthKeyDuplicatedError` e desconecta a produção.

**Desenvolvimento local funciona sem workers:**
- Frontend lê mensagens via Supabase (realtime)
- Envio funciona (API no servidor processa)
- Recebimento: workers no servidor cuidam

**Deploy no Servidor (Digital Ocean)**
```bash
ssh root@<IP_DROPLET>
cd /opt/integrater
git pull
docker compose up --build -d
docker compose logs -f api  # verificar logs
```

### Convenções de Código

**Geral**
- **Princípio Mestre:** Consistência acima de tudo. Observe arquivos existentes e siga o mesmo estilo.
- **Comentários:** Apenas quando necessário explicar o **porquê**, não o "o quê".

**Python (Backend/Workers)**
- PEP 8 + type hints obrigatórios
- Imports: stdlib → third-party → local (separados por linha)
- Pydantic para validação de dados
- Async/await para I/O

**TypeScript (Frontend)**
- Strict mode obrigatório
- Zod para validação de dados externos
- Types gerados do OpenAPI (nunca duplicar)
- React hooks em `hooks/`, utils em `lib/`

### Estrutura de Pastas

```
Integrate X/
├── CLAUDE.md           # Este arquivo
├── MILESTONES.md       # Passo a passo dos milestones
├── docs/archive/       # Documentos obsoletos (não consultar)
├── README.md           # Descrição do projeto
├── .env.example        # Template de variáveis
│
├── apps/
│   ├── web/            # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/           # App router
│   │   │   ├── components/    # UI components
│   │   │   ├── lib/           # Utils, supabase client
│   │   │   ├── api/           # Generated types (schema.d.ts)
│   │   │   └── hooks/         # React hooks
│   │   └── package.json
│   │
│   ├── api/            # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── config.py
│   │   │   ├── deps.py        # Dependencies
│   │   │   ├── routers/       # Route handlers
│   │   │   ├── services/      # Business logic
│   │   │   ├── models/        # Pydantic models
│   │   │   └── utils/         # Crypto, helpers
│   │   └── requirements.txt
│   │
│   └── workers/        # Background workers
│       ├── telegram/
│       ├── email/
│       └── shared/            # db.py, crypto.py, heartbeat.py
│
├── supabase/
│   └── migrations/     # SQL migrations
│
├── tasks/              # Rastreamento de tarefas
│   ├── README.md
│   ├── TASKS-WEB.md
│   ├── TASKS-API.md
│   ├── TASKS-WORKERS.md
│   └── TASKS-GERAL.md
│
├── docs/               # Anotações estratégicas
│   ├── web/
│   ├── api/
│   └── workers/
│
└── plans/              # Planos de features
    └── finalized/
```

---

## GERENCIAMENTO

### Arquivos Deprecados

**NAO CONSULTAR:**
- `docs/archive/PRD.md` - Documento obsoleto. Use `README.md`, `MILESTONES.md` e `tasks/` como fonte da verdade.

**Motivo:** O PRD v2.0 foi escrito no inicio do projeto e nao reflete funcionalidades implementadas posteriormente (CRM, Workspaces, n8n, etc).

---

### Milestones (MILESTONES.md)

**CRÍTICO:** Consultar SEMPRE antes de iniciar trabalho para contexto.

O arquivo `MILESTONES.md` contém os 9 milestones do projeto com:
- Critérios de aceite como checkboxes
- Status atual
- Links para tasks relacionadas

### Sistema de Tarefas

**Estrutura:** `tasks/TASKS-{WEB|API|WORKERS|GERAL}.md`

**Criar task ANTES de iniciar trabalho:**
- Adicionar em seção "Em Andamento"
- Marcar como "Concluídas" ao finalizar com data e resumo
- Criar anotação em `/docs` se bug/descoberta/solução não-óbvia
- Marcar checkbox em MILESTONES.md se critério de aceite

**Formato Task:**
```markdown
#### [AREA-XXX] Título
**Contexto:** Por que precisa fazer
**Arquivo:** `path:linha`
**Milestone:** M1-M9 ou "nenhum"
**Bloqueio:** não | sim (motivo)
**Próximos passos:**
1. Passo 1
2. Passo 2

**Atualizações:**
<!-- Adicionar aqui, não refazer acima! -->
```

### Anotações Estratégicas

**IMPORTANTE:** Antes de mexer em código significativo, **ler `docs/`** para contexto.

**Quando criar:** Muda abordagem de plano | Revela comportamento inesperado | Documenta solução não-óbvia | Afeta decisões futuras

**Estrutura:** `docs/{web|api|workers}/anotacao-<tema>-<YYYY-MM-DD>.md`

**Template:**
```markdown
---
motivo: <porque esta anotação existe>
milestone: <M1-M9 ou "nenhum">
data: YYYY-MM-DD
area: web | api | workers
impacto: alto | medio | baixo
---

## Contexto | Descoberta | Ação | Implicações
```

### Convenção de Commits

**Formato:** `<tipo>(<escopo>): <descricao>`

**Tipos:** `init` | `feat` | `fix` | `refactor` | `style` | `docs` | `perf` | `test` | `chore`

**Escopos:** `web` | `api` | `workers` | `supabase` | `docs` | `config`

**Exemplos:**
```
feat(web): implementar inbox com lista de conversas
feat(api): endpoint POST /messages/send
fix(api): corrigir race condition em job queue
```

**Regras:** Português | Imperativo | Max 72 chars | Escopo obrigatório para código

---

## SEGURANÇA

### Regras Críticas
- **Secrets:** Sempre criptografados (AES-256-GCM)
- **RLS:** Habilitado em TODAS as tabelas
- **Service Role Key:** APENAS backend/workers
- **Anon Key:** APENAS frontend (com RLS)
- **ENCRYPTION_KEY:** Em env var, NUNCA em código
- **Logs:** NUNCA contêm secrets

### Criptografia
```python
# apps/workers/shared/crypto.py
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os, base64

def encrypt(plaintext: str) -> str:
    key = base64.b64decode(os.environ["ENCRYPTION_KEY"])
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()
```

### Variáveis de Ambiente

Ver `.env.example` para template completo.

Principais:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY` (32 bytes base64)
- `GEMINI_API_KEY`
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`

---

## TROUBLESHOOTING

### Frontend não conecta ao Supabase
- Verificar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Verificar RLS policies

### Worker Telegram desconecta
- Verificar session string criptografada
- Logs em `worker_heartbeats`
- Reconnect automático com exponential backoff

### Types desatualizados
```bash
cd apps/web
npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts
```

### Supabase Realtime não funciona
- Verificar subscription no código
- Verificar RLS permite SELECT
- Ver console do browser

---

## REFERÊNCIAS

- `MILESTONES.md` - Roadmap detalhado
- `.env.example` - Template de variáveis
- `tasks/` - Rastreamento de tarefas
- `docs/` - Anotações estratégicas
