# Inbox Multicanal

Ferramenta interna para centralizar atendimento comercial via Telegram, Email e SMS.

## Stack

- **Frontend:** Next.js 14 + TypeScript + Tailwind + shadcn/ui (Vercel)
- **Backend:** Python 3.11+ + FastAPI (Digital Ocean Droplet)
- **Workers:** Python (Telethon + imapclient)
- **DB/Realtime/Storage/Auth:** Supabase
- **IA:** Gemini 3 Flash (tradução) + Gemini 3 Pro (sugestão/resumo)

## Funcionalidades

- Inbox unificado com filtros (canal/tag/status)
- Uma conversa por contato (histórico único)
- Tradução EN→PT automática
- IA assistente (sugerir resposta, resumir conversa)
- Realtime (mensagens instantâneas)
- Anexos (upload/download)
- Tags e templates

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

## Progresso

Ver `MILESTONES.md` para status atual do projeto.
