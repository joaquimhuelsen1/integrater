---
motivo: Documentar problema de race condition no envio de mensagens outbound
milestone: M3
data: 2025-12-20
area: workers
impacto: medio
---

# Race Condition no Outbound Loop

## Contexto
Mensagens enviadas pelo frontend não chegavam no Telegram. O `external_message_id` era marcado como `error-...` mas nenhum erro aparecia nos logs.

## Descoberta
O problema era uma race condition no worker:
1. O `_sync_loop` e `_outbound_loop` rodam em paralelo via `asyncio.gather()`
2. O outbound loop começa a processar imediatamente (a cada 2s)
3. O sync loop demora alguns segundos para conectar a conta Telegram
4. Resultado: outbound tenta enviar antes da conta estar conectada

## Ação
O código já lidava corretamente com isso - quando `acc_id not in self.clients`, retorna sem marcar erro e tenta novamente em 2s.

O problema real era que **múltiplos workers estavam rodando** (processos Python órfãos) e competindo pelas mesmas mensagens.

## Solução
1. Matar todos os processos Python antes de reiniciar o worker
2. O código atual está correto - não marca erro se conta não conectada
3. Retry automático a cada 2s funciona perfeitamente

## Implicações
- Em produção, garantir que apenas UM worker Telegram rode por vez
- Considerar usar locking/mutex se precisar de múltiplas instâncias
- Logs simplificados para evitar poluição
