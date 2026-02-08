# Tasks - Geral

Tarefas gerais: setup, docs, configs, migrations.

## Pendentes

<!-- Adicionar tarefas pendentes aqui -->

## Em Andamento

<!-- Tarefas sendo trabalhadas -->

## Concluídas

#### [GERAL-004] Replicar framework Claude no Codex (workflow + skills + comandos)
**Contexto:** Espelhar estrutura operacional do Claude Code no ambiente Codex para manter o mesmo modo de trabalho
**Arquivo:** `AGENT.md`
**Milestone:** nenhum
**Data conclusao:** 2026-02-06
**Resumo:** Espelho aplicado com `C:/Users/Joaquim Huelsen/.claude/CLAUDE.md` copiado para `AGENT.md` (projeto e `~/.codex`), copia de `agents/commands/context-pills/hooks` para `~/.codex`, e instalacao das skills `design-principles`, `agent-creator-cc`, `skill-creator-cc`.

Estimativa
- Tamanho: Media
- Complexidade: Media
- Impacto: Alto
- Risco: Medio

#### [GERAL-003] Suprimir aviso experimental_windows_sandbox no Codex
**Contexto:** Remover aviso recorrente de feature instavel no terminal do usuario
**Arquivo:** `C:/Users/Joaquim Huelsen/.codex/config.toml`
**Milestone:** nenhum
**Data conclusao:** 2026-02-06
**Resumo:** Chave `suppress_unstable_features_warning = true` adicionada no config global do Codex; aviso suprimido.

Estimativa
- Tamanho: Pequena
- Complexidade: Baixa
- Impacto: Baixo
- Risco: Baixo

#### [GERAL-002] Implementar Modo Professor no CLAUDE.md
**Contexto:** Transformar agente em professor de programação nível zero
**Arquivo:** `CLAUDE.md`
**Milestone:** nenhum
**Data conclusão:** 2025-12-27
**Resumo:** Adicionada seção "🎓 MODO PROFESSOR" com formato obrigatório de resposta didática, exemplos de explicação nível zero, e sistema de progressão de vocabulário.

📊 Estimativa
- Tamanho: Pequena
- Complexidade: Baixa
- Impacto: Alto
- Risco: Baixo

#### [GERAL-001] Setup inicial do projeto
**Contexto:** Criar estrutura base do projeto
**Arquivo:** múltiplos
**Milestone:** `M1`
**Bloqueio:** não

**Atualizações:**
- 2024-12-19: Criado CLAUDE.md, MILESTONES.md, estrutura tasks/
- 2024-12-19: Criado estrutura docs/, plans/, apps/
- 2024-12-19: Criado .env.example e README.md

📊 Estimativa
- Tamanho: Média
- Complexidade: Baixa
- Impacto: Alto
- Risco: Baixo
