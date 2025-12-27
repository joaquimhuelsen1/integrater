# Tasks - Rastreamento de Tarefas

Sistema de rastreamento de tarefas para evitar perda de contexto entre sessões.

## Estrutura

```
tasks/
├── TASKS-WEB.md        # Frontend Next.js (UI, components, hooks)
├── TASKS-API.md        # Backend FastAPI (endpoints, services, IA)
├── TASKS-WORKERS.md    # Workers Telegram/Email (MTProto, IMAP)
└── TASKS-GERAL.md      # Setup, docs, configs, migrations
```

## Formato de Task

```markdown
#### [AREA-XXX] Título
**Contexto:** Por que precisa fazer
**Arquivo:** `path:linha`
**Milestone:** `M1` | `M2` | ... | `M9` ou "nenhum"
**Bloqueio:** não | sim (motivo)
**Próximos passos:**
1. Passo 1
2. Passo 2

**Referências:**
- Anotação: `docs/.../anotacao-*.md`
- Commit: `hash`

**Atualizações:**
<!-- Adicionar aqui ao atualizar, NÃO refazer acima! -->
- YYYY-MM-DD: atualização 1
```

**Áreas:** `WEB`, `API`, `WORKERS`, `GERAL`

## Regras da IA

### Ao criar tarefa
- ✅ Criar automaticamente (não perguntar)
- ✅ Adicionar em "Em Andamento"
- ✅ Informar: Tamanho | Complexidade | Impacto | Risco

### Ao atualizar
- ❌ NÃO refazer tarefa inteira
- ✅ APENAS adicionar em "Atualizações"

### Ao finalizar
- ✅ Mover para seção "Concluídas"
- ✅ Adicionar: data, resultado, commit hash
- ✅ Criar anotação em `/docs` se relevante
- ✅ Marcar checkbox em `MILESTONES.md` se aplicável

## Exemplo de Task

```markdown
#### [WEB-001] Implementar componente InboxList
**Contexto:** Listar conversas ordenadas por last_message_at
**Arquivo:** `apps/web/src/components/inbox-list.tsx`
**Milestone:** `M2`
**Bloqueio:** não
**Próximos passos:**
1. Criar componente com shadcn Card
2. Adicionar filtros (canal, status, tags)
3. Implementar Realtime subscription
4. Testar com dados seed

**Referências:**
- PRD: seção FR-02

**Atualizações:**
- 2024-12-19: Componente criado com lista básica
- 2024-12-19: Adicionado filtros, testado OK, commit `abc123`
```

## Estimativas

Ao criar tarefa, informar:

```
📊 Estimativa
- Tamanho: Pequena | Média | Grande
- Complexidade: Baixa | Média | Alta
- Impacto: Baixo | Médio | Alto
- Risco: Baixo | Médio | Alto | Perigoso
```

## Relação com Milestones

Cada task deve referenciar o milestone relacionado (`M1` a `M9`).

Ao concluir task que satisfaz critério de aceite:
1. Marcar checkbox correspondente em `MILESTONES.md`
2. Atualizar tabela de progresso
