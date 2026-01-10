# CLAUDE.md - Integrate X

Inbox multicanal (Telegram + Email + SMS) para centralizar atendimento comercial.

## Context-Pills

Carregar de `~/.claude/context-pills/` quando necessario:

| Pill | Trigger |
|------|---------|
| `deploy-integrater.md` | Deploy API/Frontend (paramiko + credenciais) |

## Regras do Projeto

### Portas Fixas
- **API:** localhost:8000
- **Web:** localhost:3000

Se ocupada: **MATAR PROCESSO**. Nunca usar porta alternativa.

### Documentacao Obrigatoria
1. `docs/` - descobertas, bugs corrigidos
2. `README.md` - novas features
3. `tasks/TASKS-*.md` - tarefas concluidas
4. `MILESTONES.md` - checkboxes de aceite

### Workers
**NAO RODAR LOCALMENTE!** Telegram so permite 1 sessao por API ID.

## Stack

| Camada | Tech |
|--------|------|
| Frontend | Next.js 14 + TypeScript + Tailwind + shadcn/ui |
| Backend | Python 3.11+ + FastAPI + Docker |
| Workers | Telethon (Telegram) + imapclient (Email) |
| DB | Supabase |
| SMS | OpenPhone API |
| IA | Gemini Flash/Pro |

## Estrutura

```
apps/
├── web/      # Next.js (Vercel)
├── api/      # FastAPI (Digital Ocean)
└── workers/  # Telegram/Email (Docker)
```

## Deploy

**Carregar pill `deploy-integrater.md` para comandos completos.**

Resumo:
- **Frontend:** Push para `main` → Vercel automatico
- **API:** Usar script paramiko da pill

## Convencoes

### Commits
`<tipo>(<escopo>): <descricao>`

Tipos: `feat` | `fix` | `refactor` | `docs` | `chore`
Escopos: `web` | `api` | `workers` | `supabase`

### Codigo
- Python: PEP 8 + type hints
- TypeScript: strict mode, sem `any`
- Secrets: AES-256-GCM (nunca plaintext)
- RLS: habilitado em todas tabelas

## Arquivos Importantes

| Arquivo | Proposito |
|---------|-----------|
| `MILESTONES.md` | Roadmap com checkboxes |
| `tasks/TASKS-*.md` | Tarefas por area |
| `docs/` | Anotacoes estrategicas |
| `.env.example` | Template de variaveis |

## Troubleshooting

| Problema | Solucao |
|----------|---------|
| Types desatualizados | `npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts` |
| Realtime nao funciona | Verificar RLS permite SELECT |
| Worker desconecta | Ver `worker_heartbeats`, exponential backoff ativo |
