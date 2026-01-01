"""
Watchdog para monitorar e reiniciar loops travados.

Conceito simples:
- Cada loop chama watchdog.ping("nome") a cada ciclo
- Watchdog verifica se algum loop parou de dar ping
- Se parou (>60s), reinicia automaticamente
"""
import asyncio
from datetime import datetime
from typing import Callable, Coroutine, Any


class LoopWatchdog:
    """Monitora loops e reinicia se travarem."""

    def __init__(self, max_silence: int = 60):
        """
        Args:
            max_silence: Segundos sem ping antes de considerar travado
        """
        self.max_silence = max_silence
        self.loop_pings: dict[str, datetime] = {}
        self.loop_factories: dict[str, Callable[[], Coroutine]] = {}
        self.loop_tasks: dict[str, asyncio.Task] = {}
        self.restart_counts: dict[str, int] = {}
        self._running = True

    def register(self, name: str, task: asyncio.Task, factory: Callable[[], Coroutine]):
        """
        Registra loop para monitoramento.

        Args:
            name: Nome do loop (ex: "outbound", "sync")
            task: Task asyncio do loop
            factory: Função que cria nova instância do loop
        """
        self.loop_tasks[name] = task
        self.loop_factories[name] = factory
        self.loop_pings[name] = datetime.now()
        self.restart_counts[name] = 0
        print(f"[WATCHDOG] Loop '{name}' registrado")

    def ping(self, name: str):
        """
        Chamado pelo loop a cada ciclo para indicar que está vivo.

        Args:
            name: Nome do loop
        """
        self.loop_pings[name] = datetime.now()

    async def stop(self):
        """Para o watchdog."""
        self._running = False

    async def monitor(self):
        """Loop de monitoramento - roda continuamente."""
        # Aguarda startup dos loops
        await asyncio.sleep(30)
        print("[WATCHDOG] Iniciando monitoramento")

        while self._running:
            try:
                now = datetime.now()

                for name in list(self.loop_pings.keys()):
                    last_ping = self.loop_pings.get(name)
                    task = self.loop_tasks.get(name)

                    if not last_ping or not task:
                        continue

                    silence = (now - last_ping).total_seconds()

                    # Caso 1: Loop travado (sem ping há muito tempo)
                    if silence > self.max_silence:
                        print(f"[WATCHDOG] '{name}' sem ping há {silence:.0f}s - TRAVADO")
                        await self._restart_loop(name)

                    # Caso 2: Task morreu (exceção não tratada)
                    elif task.done():
                        exc = None
                        try:
                            exc = task.exception()
                        except asyncio.CancelledError:
                            pass
                        print(f"[WATCHDOG] '{name}' morreu: {exc}")
                        await self._restart_loop(name)

            except Exception as e:
                print(f"[WATCHDOG] Erro no monitor: {e}")

            await asyncio.sleep(10)

    async def _restart_loop(self, name: str):
        """Reinicia um loop travado."""
        try:
            # Cancela task antiga
            old_task = self.loop_tasks.get(name)
            if old_task and not old_task.done():
                old_task.cancel()
                try:
                    await asyncio.wait_for(old_task, timeout=5)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    pass

            # Cria nova task
            factory = self.loop_factories.get(name)
            if factory:
                new_task = asyncio.create_task(factory())
                self.loop_tasks[name] = new_task
                self.loop_pings[name] = datetime.now()
                self.restart_counts[name] = self.restart_counts.get(name, 0) + 1
                print(f"[WATCHDOG] '{name}' reiniciado (total: {self.restart_counts[name]}x)")
            else:
                print(f"[WATCHDOG] Sem factory para '{name}', não pode reiniciar")

        except Exception as e:
            print(f"[WATCHDOG] Erro ao reiniciar '{name}': {e}")

    def get_status(self) -> dict:
        """Retorna status de todos os loops."""
        now = datetime.now()
        status = {}

        for name in self.loop_pings.keys():
            last_ping = self.loop_pings.get(name)
            task = self.loop_tasks.get(name)

            status[name] = {
                "last_ping_ago": (now - last_ping).total_seconds() if last_ping else None,
                "alive": task is not None and not task.done(),
                "restarts": self.restart_counts.get(name, 0),
            }

        return status
