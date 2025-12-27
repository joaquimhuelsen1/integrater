# Inbox Multicanal

Ferramenta interna para centralizar atendimento comercial via Telegram, Email e SMS.

## Deploy (Produção)

- **Frontend:** Vercel - https://integrater.vercel.app
- **Backend/API:** Digital Ocean Droplet - https://api.thereconquestmap.com
- **Workers:** Docker containers no mesmo Droplet

## Stack

- **Frontend:** Next.js 14 + TypeScript + Tailwind + shadcn/ui (Vercel)
- **Backend:** Python 3.11+ + FastAPI + Docker (Digital Ocean Droplet)
- **Workers:** Python (Telethon + imapclient) em Docker
- **DB/Realtime/Storage/Auth:** Supabase
- **IA:** Gemini 3 Flash (tradução) + Gemini 3 Pro (sugestão/resumo)
- **SMS:** OpenPhone API (webhooks inbound/outbound)

## Funcionalidades

- Inbox unificado com filtros (canal/tag/status)
- Uma conversa por contato (histórico único)
- Tradução EN→PT automática
- IA assistente (sugerir resposta, resumir conversa)
- Realtime (mensagens instantâneas)
- Anexos (upload/download)
- Tags e templates
- SMS via OpenPhone (enviar/receber)

## Documentação

- `PRD.md` - Documento de requisitos (fonte da verdade)
- `CLAUDE.md` - Manual do agente (convenções, fluxo)
- `MILESTONES.md` - Passo a passo do projeto

## Estrutura

```
Integrate X/
├── apps/
│   ├── web/            # Frontend Next.js
│   ├── api/            # Backend FastAPI
│   └── workers/        # Telegram/Email workers
├── supabase/
│   └── migrations/     # SQL migrations
├── tasks/              # Rastreamento de tarefas
├── docs/               # Anotações estratégicas
└── plans/              # Planos de features
```

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
npm run dev
```

### Backend

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Workers

```bash
cd apps/workers
python -m venv .venv
source .venv/bin/activate
pip install -r telegram/requirements.txt -r email/requirements.txt
python telegram/worker.py
```

## Deploy no Servidor

### Atualizar Backend (Digital Ocean)

```bash
ssh root@<IP_DROPLET>
cd /opt/integrater
git pull
docker compose up --build -d
docker compose logs -f api  # verificar logs
```

### Estrutura Docker

```yaml
# docker-compose.yml
services:
  api:        # FastAPI na porta 8000
  telegram:   # Worker Telegram
  email:      # Worker Email
```

### Webhooks OpenPhone

Configurar no painel OpenPhone:
- `message.received` → `https://api.thereconquestmap.com/openphone/webhook/inbound`
- `message.delivered` → `https://api.thereconquestmap.com/openphone/webhook/status`

## Progresso

Ver `MILESTONES.md` para status atual do projeto.
