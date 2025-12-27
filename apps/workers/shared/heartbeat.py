import asyncio
from datetime import datetime
from uuid import UUID
from .db import get_supabase


class Heartbeat:
    def __init__(
        self,
        owner_id: UUID,
        integration_account_id: UUID,
        worker_type: str,
        interval: int = 30,
    ):
        self.owner_id = str(owner_id)
        self.integration_account_id = str(integration_account_id)
        self.worker_type = worker_type
        self.interval = interval
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._heartbeat_loop())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self._update_status("offline")

    async def _heartbeat_loop(self):
        while self._running:
            try:
                await self._update_status("online")
            except Exception as e:
                print(f"Heartbeat error: {e}")
            await asyncio.sleep(self.interval)

    async def _update_status(self, status: str):
        db = get_supabase()
        now = datetime.utcnow().isoformat()

        # Upsert heartbeat
        db.table("worker_heartbeats").upsert({
            "owner_id": self.owner_id,
            "integration_account_id": self.integration_account_id,
            "worker_type": self.worker_type,
            "status": status,
            "last_heartbeat_at": now,
            "updated_at": now,
        }, on_conflict="integration_account_id,worker_type").execute()
