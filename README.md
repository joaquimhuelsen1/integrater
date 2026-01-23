# Integrate X - Inbox Multicanal

Ferramenta interna para centralizar atendimento comercial via Telegram, Email e SMS em uma interface unificada com CRM e IA.

## Deploy (Produção)

- **Frontend:** Vercel - https://integrater.vercel.app
- **Backend/API:** Digital Ocean Droplet - https://api.thereconquestmap.com
- **Workers:** Docker containers no mesmo Droplet
- **Orquestração:** n8n (13 workflows)

## Stack

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | Next.js 16 + React 19 + TypeScript + Tailwind 4 + shadcn/ui |
| **Backend** | Python 3.11+ + FastAPI + Pydantic |
| **Workers** | Telethon (Telegram) + IMAPClient (Email) |
| **Database** | PostgreSQL (Supabase) + RLS |
| **Realtime** | Supabase Realtime (WebSocket) |
| **Storage** | Supabase Storage (S3-compatible) |
| **Auth** | Supabase Auth (JWT) |
| **IA** | Gemini 3 Flash (tradução) + Gemini 3 Pro (sugestão/resumo) |
| **SMS** | OpenPhone API (webhooks) |

## Funcionalidades

### Inbox
- Inbox unificado com filtros (canal/tag/status)
- Uma conversa por contato (histórico único)
- Realtime (mensagens instantâneas via WebSocket)
- Anexos (upload/download com signed URLs)
- Tags e templates de resposta
- Busca full-text

### Canais
- **Telegram:** Múltiplas contas, auth 2FA, sync histórico
- **Email:** IMAP/SMTP, threading automático, SES fallback
- **SMS:** OpenPhone webhooks, múltiplos números

### IA
- Tradução EN→PT automática (Gemini 3 Flash)
- Sugestão de resposta (Gemini 3 Pro)
- Resumo de conversa
- Prompts customizáveis por workspace

### CRM
- Pipelines de vendas (Kanban)
- Deals com custom fields
- Timeline de atividades
- Analytics (win rate, valor médio)

### Multi-workspace
- Workspaces isolados
- Seletor de workspace na UI

## Estrutura

```
Integrate X/
├── apps/
│   ├── web/            # Frontend Next.js (70+ arquivos)
│   │   ├── src/app/    # App Router
│   │   ├── src/components/  # 50+ componentes
│   │   ├── src/hooks/  # Realtime, Sound
│   │   └── src/lib/    # API client, Supabase
│   ├── api/            # Backend FastAPI
│   │   ├── app/routers/     # 26 endpoints
│   │   ├── app/models/      # Pydantic schemas
│   │   └── app/services/    # Gemini, Translator
│   └── workers/        # Background processors
│       ├── telegram/   # Telethon client
│       ├── email/      # IMAP/SMTP + SES
│       └── shared/     # DB, Crypto, Heartbeat
├── supabase/
│   └── migrations/     # 17+ SQL migrations
├── tasks/              # Rastreamento de tarefas
├── docs/               # Anotações estratégicas
└── plans/              # Planos de features
```

## Documentação

- `CLAUDE.md` - Manual do agente (convenções, fluxo)
- `MILESTONES.md` - Histórico dos milestones (todos concluídos)

## Setup

### Pré-requisitos

- Node.js 20+
- Python 3.11+
- Conta Supabase
- Conta Google AI (Gemini API)
- Credenciais Telegram API

### Configuração

1. Clone o repositório
2. Copie `.env.example` para `.env`
3. Preencha as variáveis de ambiente

### Frontend

```bash
cd apps/web
npm install
npm run dev  # http://localhost:3000
```

### Backend

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### API Local via Docker (Recomendado)

```bash
# Na raiz do projeto
docker-compose up api -d --build

# Verificar status
docker ps -a --filter "name=inbox-api"

# Ver logs
docker logs -f inbox-api
```

Atualizar `apps/web/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Workers (APENAS NO SERVIDOR)

**IMPORTANTE:** Os workers rodam APENAS no servidor de produção. NÃO rode localmente para evitar conflito de sessão Telegram.

**Para desenvolvimento local:**
- Frontend funciona normal (lê mensagens via Supabase)
- Envio de mensagens funciona (API no servidor processa)
- Workers no servidor cuidam do recebimento

## Deploy no Servidor

### Atualizar Backend (Digital Ocean)

```bash
ssh root@<IP_DROPLET>
cd /opt/integrater
git pull
docker compose up --build -d
docker compose logs -f api
```

### Estrutura Docker

```yaml
services:
  api:        # FastAPI na porta 8000
  telegram:   # Worker Telegram (porta 8001)
  email:      # Worker Email (porta 8002)
```

### Webhooks OpenPhone

Configurar no painel OpenPhone:
- `message.received` → `https://api.thereconquestmap.com/openphone/webhook/inbound`
- `message.delivered` → `https://api.thereconquestmap.com/openphone/webhook/status`

## Arquitetura de Ownership

O projeto utiliza modelo **WORKSPACE-CENTRIC** desde janeiro/2026:

- **Tier 1**: Workspaces (dono do workspace, RESTRICT deletes)
- **Tier 2**: Dados primários (conversations, deals, contacts) - FK workspace_id CASCADE
- **Tier 3**: Dados derivados (messages, attachments, tags) - FK workspace_id CASCADE
- **Tier 4**: Logs e heartbeats (app_logs, worker_heartbeats) - FK owner_id CASCADE

**Garantias**:
- Deletar usuário é BLOQUEADO se possui workspaces/dados (RESTRICT)
- Deletar workspace deleta TODOS seus dados em cascata (CASCADE)
- RLS policies garantem isolamento single-user por workspace

Ver `docs/CHANGELOG.md` para detalhes da migração (2026-01-23).

## Status

**Projeto completo.** Todos os 9 milestones foram concluídos (44/44 critérios).

Ver `MILESTONES.md` para detalhes do histórico de desenvolvimento.
