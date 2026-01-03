# Plano de Reestruturação: Worker Telegram Resiliente

**Data:** 2026-01-01
**Problema:** Worker trava frequentemente, heartbeat para, mensagens não são enviadas
**Objetivo:** Worker auto-recuperável que nunca trava

---

## 1. Diagnóstico dos Problemas Atuais

### 1.1 Pontos de Travamento Identificados

| Local | Linha | Operação | Problema |
|-------|-------|----------|----------|
| `_send_telegram_message` | 314 | `client.get_input_entity()` | Sem timeout |
| `_send_telegram_message` | 323 | `client.get_entity()` | Sem timeout |
| `_send_telegram_message` | 343 | `client.send_message()` | Sem timeout |
| `_send_with_attachments` | ~400 | `client.send_file()` | Sem timeout |
| `_handle_incoming_message` | ~500 | Operações DB | Sem timeout |
| `_process_history_sync_jobs` | ~1050 | `client.get_messages()` | Sem timeout |

### 1.2 Problemas Arquiteturais

1. **`asyncio.gather()` sem supervisão** - Se um loop falha, não há recovery
2. **Heartbeat por conta** - Não indica saúde do worker como um todo
3. **Sem watchdog** - Ninguém monitora se loops estão rodando
4. **Sem métricas** - Impossível saber onde travou
5. **Logs insuficientes** - Difícil debugar

---

## 2. Nova Arquitetura Proposta

### 2.1 Visão Geral

```
┌─────────────────────────────────────────────────────────────┐
│                    TELEGRAM WORKER                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Sync Loop   │  │ Outbound    │  │ History     │         │
│  │ (contas)    │  │ Loop        │  │ Sync Loop   │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          │                                  │
│                    ┌─────▼─────┐                           │
│                    │ WATCHDOG  │ ← Monitora todos loops    │
│                    │ (global)  │   Reinicia se travar      │
│                    └─────┬─────┘                           │
│                          │                                  │
│                    ┌─────▼─────┐                           │
│                    │ HEARTBEAT │ ← Heartbeat global        │
│                    │ (global)  │   Independente dos loops  │
│                    └───────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Componentes Novos

#### A) Constantes de Timeout
```python
# Timeouts em segundos
TIMEOUT_TELEGRAM_SEND = 30      # Enviar mensagem
TIMEOUT_TELEGRAM_ENTITY = 15    # Resolver entidade
TIMEOUT_TELEGRAM_MEDIA = 60     # Upload de mídia
TIMEOUT_DB_OPERATION = 10       # Operações Supabase
TIMEOUT_LOOP_CYCLE = 120        # Máximo por ciclo de loop
```

#### B) Wrapper com Timeout
```python
async def with_timeout(coro, timeout: float, operation: str):
    """Executa coroutine com timeout, loga se falhar."""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        print(f"[TIMEOUT] {operation} excedeu {timeout}s")
        raise
```

#### C) Watchdog Global
```python
class LoopWatchdog:
    """Monitora loops e reinicia se travarem."""

    def __init__(self):
        self.loop_heartbeats: dict[str, datetime] = {}
        self.loop_tasks: dict[str, asyncio.Task] = {}
        self.max_silence = 60  # segundos sem heartbeat = travado

    def ping(self, loop_name: str):
        """Chamado por cada loop a cada ciclo."""
        self.loop_heartbeats[loop_name] = datetime.now()

    async def monitor(self):
        """Verifica loops e reinicia travados."""
        while True:
            now = datetime.now()
            for name, last_ping in self.loop_heartbeats.items():
                silence = (now - last_ping).total_seconds()
                if silence > self.max_silence:
                    print(f"[WATCHDOG] Loop {name} travado ({silence:.0f}s)")
                    await self._restart_loop(name)
            await asyncio.sleep(10)
```

#### D) Heartbeat Global
```python
class GlobalHeartbeat:
    """Heartbeat independente que sempre roda."""

    async def run(self):
        while True:
            try:
                db = get_supabase()
                db.table("worker_heartbeats").upsert({
                    "worker_id": "telegram-main",
                    "status": "online",
                    "last_heartbeat_at": datetime.utcnow().isoformat(),
                    "loops_status": self.get_loops_status(),
                }).execute()
            except Exception as e:
                print(f"[HEARTBEAT] Erro: {e}")
            await asyncio.sleep(15)
```

---

## 3. Mudanças no Código

### 3.1 Arquivo: `worker.py`

#### Mudança 1: Adicionar imports e constantes
```python
# No topo do arquivo
TIMEOUT_TELEGRAM_SEND = 30
TIMEOUT_TELEGRAM_ENTITY = 15
TIMEOUT_TELEGRAM_MEDIA = 60
TIMEOUT_DB = 10
```

#### Mudança 2: Helper com timeout
```python
async def telegram_op(coro, timeout: float, op_name: str):
    """Executa operação Telegram com timeout."""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        print(f"[TIMEOUT] {op_name} após {timeout}s")
        return None
    except Exception as e:
        print(f"[ERROR] {op_name}: {e}")
        return None
```

#### Mudança 3: Novo método start() com watchdog
```python
async def start(self):
    print("Telegram Worker iniciando...")

    self.watchdog = LoopWatchdog()

    # Cria tasks para cada loop
    loops = {
        "sync": self._sync_loop_safe(),
        "outbound": self._outbound_loop_safe(),
        "history": self._history_sync_loop_safe(),
        "jobs": self._message_jobs_loop_safe(),
    }

    for name, coro in loops.items():
        task = asyncio.create_task(coro)
        self.watchdog.register(name, task)

    # Inicia watchdog e heartbeat global
    await asyncio.gather(
        self.watchdog.monitor(),
        self._global_heartbeat(),
    )
```

#### Mudança 4: Loops com ping ao watchdog
```python
async def _outbound_loop_safe(self):
    """Loop de envio com watchdog ping."""
    while True:
        try:
            self.watchdog.ping("outbound")  # NOVO
            await self._process_outbound_messages()
            await asyncio.sleep(2)
        except Exception as e:
            print(f"[OUTBOUND] Erro: {e}")
            await asyncio.sleep(5)
```

#### Mudança 5: Operações com timeout
```python
# ANTES (pode travar):
entity = await client.get_entity(telegram_user_id)
sent = await client.send_message(entity, text)

# DEPOIS (com timeout):
entity = await telegram_op(
    client.get_entity(telegram_user_id),
    TIMEOUT_TELEGRAM_ENTITY,
    f"get_entity({telegram_user_id})"
)
if not entity:
    return  # Falhou, tenta no próximo ciclo

sent = await telegram_op(
    client.send_message(entity, text),
    TIMEOUT_TELEGRAM_SEND,
    f"send_message({telegram_user_id})"
)
```

### 3.2 Arquivo: `shared/watchdog.py` (NOVO)

```python
"""
Watchdog para monitorar e reiniciar loops travados.
"""
import asyncio
from datetime import datetime
from typing import Callable, Coroutine


class LoopWatchdog:
    def __init__(self, max_silence: int = 60):
        self.max_silence = max_silence
        self.loop_pings: dict[str, datetime] = {}
        self.loop_factories: dict[str, Callable[[], Coroutine]] = {}
        self.loop_tasks: dict[str, asyncio.Task] = {}

    def register(self, name: str, task: asyncio.Task, factory: Callable):
        """Registra loop para monitoramento."""
        self.loop_tasks[name] = task
        self.loop_factories[name] = factory
        self.loop_pings[name] = datetime.now()

    def ping(self, name: str):
        """Chamado pelo loop a cada ciclo."""
        self.loop_pings[name] = datetime.now()

    async def monitor(self):
        """Loop de monitoramento."""
        await asyncio.sleep(30)  # Aguarda startup

        while True:
            now = datetime.now()

            for name, last_ping in list(self.loop_pings.items()):
                silence = (now - last_ping).total_seconds()
                task = self.loop_tasks.get(name)

                # Verifica se travou
                if silence > self.max_silence:
                    print(f"[WATCHDOG] {name} sem ping há {silence:.0f}s - reiniciando")
                    await self._restart_loop(name)

                # Verifica se task morreu
                elif task and task.done():
                    exc = task.exception() if not task.cancelled() else None
                    print(f"[WATCHDOG] {name} morreu: {exc} - reiniciando")
                    await self._restart_loop(name)

            await asyncio.sleep(10)

    async def _restart_loop(self, name: str):
        """Reinicia um loop."""
        # Cancela task antiga
        old_task = self.loop_tasks.get(name)
        if old_task and not old_task.done():
            old_task.cancel()
            try:
                await old_task
            except asyncio.CancelledError:
                pass

        # Cria nova task
        factory = self.loop_factories.get(name)
        if factory:
            new_task = asyncio.create_task(factory())
            self.loop_tasks[name] = new_task
            self.loop_pings[name] = datetime.now()
            print(f"[WATCHDOG] {name} reiniciado com sucesso")

    def get_status(self) -> dict:
        """Retorna status de todos os loops."""
        now = datetime.now()
        return {
            name: {
                "last_ping_ago": (now - ping).total_seconds(),
                "alive": not self.loop_tasks[name].done() if name in self.loop_tasks else False,
            }
            for name, ping in self.loop_pings.items()
        }
```

---

## 4. Ordem de Implementação

### Fase 1: Fundação (30 min)
1. [ ] Criar `shared/watchdog.py`
2. [ ] Adicionar constantes de timeout no worker
3. [ ] Criar helper `telegram_op()` com timeout

### Fase 2: Loops Seguros (20 min)
4. [ ] Modificar `_outbound_loop` → `_outbound_loop_safe`
5. [ ] Modificar `_sync_loop` → `_sync_loop_safe`
6. [ ] Modificar `_history_sync_loop` → `_history_sync_loop_safe`
7. [ ] Modificar `_message_jobs_loop` → `_message_jobs_loop_safe`

### Fase 3: Operações com Timeout (30 min)
8. [ ] `_send_telegram_message`: timeout em get_entity, send_message
9. [ ] `_send_with_attachments`: timeout em send_file
10. [ ] `_handle_incoming_message`: timeout em operações DB
11. [ ] `_process_history_sync_jobs`: timeout em get_messages

### Fase 4: Watchdog + Heartbeat Global (20 min)
12. [ ] Integrar watchdog no `start()`
13. [ ] Adicionar heartbeat global
14. [ ] Adicionar logs estruturados

### Fase 5: Deploy e Teste (15 min)
15. [ ] Deploy no servidor
16. [ ] Monitorar logs por 10 min
17. [ ] Testar envio de mensagens

---

## 5. Testes de Validação

### Teste 1: Timeout funciona
- Desconectar internet do servidor por 20s
- Worker deve logar timeout e continuar

### Teste 2: Watchdog reinicia loop travado
- Simular loop travado (sleep infinito)
- Watchdog deve detectar e reiniciar em ~60s

### Teste 3: Heartbeat global sempre roda
- Mesmo com loops travados
- Heartbeat deve atualizar a cada 15s

### Teste 4: Mensagens enviadas rapidamente
- Enviar 5 mensagens em sequência
- Todas devem chegar em <10s

---

## 6. Métricas de Sucesso

| Métrica | Antes | Depois |
|---------|-------|--------|
| Travamentos/dia | ~5 | 0 |
| Tempo de envio | 2-300s | <5s |
| Uptime | ~90% | >99% |
| Recovery manual | Sim | Não |

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Timeout muito curto | Média | Usar 30s padrão, ajustar se necessário |
| Watchdog falso positivo | Baixa | max_silence=60s é conservador |
| Loop reinicia infinitamente | Baixa | Adicionar contador de restarts |

---

## Aprovação

- [ ] Usuário aprova o plano
- [ ] Iniciar implementação

