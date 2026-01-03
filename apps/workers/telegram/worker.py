"""
Worker Telegram - Recebe e envia mensagens via Telethon

ARQUITETURA COM n8n:
- Worker captura eventos do Telegram e envia para webhooks n8n
- Worker expõe API HTTP para n8n enviar comandos de envio
- n8n orquestra toda a lógica de negócio (criar identity, conversa, inserir mensagens)
- Worker mantém: presence, sync histórico, heartbeat

Uso:
    python worker.py

Env vars necessárias:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    ENCRYPTION_KEY
    TELEGRAM_API_ID, TELEGRAM_API_HASH
    N8N_API_KEY, N8N_WEBHOOK_INBOUND, N8N_WEBHOOK_OUTBOUND
    WORKER_API_KEY, WORKER_HTTP_PORT
"""

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from uuid import UUID, uuid4

import uvicorn
from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.tl.types import (
    User, PeerUser, MessageService, Chat, Channel,
    MessageActionChatJoinedByLink, MessageActionChatAddUser,
    MessageActionChatDeleteUser, MessageActionChatJoinedByRequest,
    UserStatusOnline, UserStatusOffline, UserStatusRecently,
    UpdateShortMessage, UpdateNewMessage, UpdateEditMessage,
)
from telethon.tl.functions.messages import ReadHistoryRequest

# Adiciona shared ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.db import get_supabase
from shared.crypto import decrypt
from shared.heartbeat import Heartbeat
from shared.watchdog import LoopWatchdog
from supabase import create_client as create_supabase_client

# Importa módulos locais
from webhooks import notify_inbound_message, notify_outbound_message, notify_sync_batch
from api import app as fastapi_app, set_worker, WORKER_HTTP_PORT

load_dotenv()

# Timeouts em segundos
TIMEOUT_TELEGRAM_SEND = 30
TIMEOUT_TELEGRAM_ENTITY = 3
TIMEOUT_TELEGRAM_MEDIA = 60
TIMEOUT_DB = 10

# Cache settings
ENTITY_CACHE_TTL = 3600
ENTITY_FAIL_CACHE_TTL = 300
PRESENCE_THROTTLE_SECONDS = 5


async def telegram_op(coro, timeout: float, op_name: str):
    """Executa operação Telegram com timeout."""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        print(f"[TIMEOUT] {op_name} excedeu {timeout}s")
        return None
    except Exception as e:
        print(f"[ERROR] {op_name}: {e}")
        return None


async def db_async(query_fn):
    """Executa query do Supabase em thread separada."""
    return await asyncio.to_thread(query_fn)


class TelegramWorker:
    def __init__(self):
        self.api_id = int(os.environ["TELEGRAM_API_ID"])
        self.api_hash = os.environ["TELEGRAM_API_HASH"]
        self.clients: dict[str, TelegramClient] = {}
        self.client_tasks: dict[str, asyncio.Task] = {}
        self.heartbeats: dict[str, Heartbeat] = {}
        self.account_info: dict[str, dict] = {}
        self.watchdog = LoopWatchdog(max_silence=60)
        
        # Caches
        self.entity_cache: dict[int, tuple] = {}
        self.entity_fail_cache: dict[int, float] = {}
        self.presence_cache: dict[int, tuple] = {}
        self.sent_via_api: dict[int, float] = {}  # msg_id -> timestamp (msgs enviadas via API)
        self.pending_sends: dict[int, float] = {}  # user_id -> timestamp (envios em progresso)

    def _get_cached_entity(self, user_id: int):
        """Retorna entity do cache se válida."""
        import time
        if user_id in self.entity_cache:
            entity, ts = self.entity_cache[user_id]
            if time.time() - ts < ENTITY_CACHE_TTL:
                return entity
            del self.entity_cache[user_id]
        return None

    def _cache_entity(self, user_id: int, entity):
        """Salva entity no cache."""
        import time
        self.entity_cache[user_id] = (entity, time.time())

    def _is_entity_failed(self, user_id: int) -> bool:
        """Verifica se get_entity falhou recentemente."""
        import time
        if user_id in self.entity_fail_cache:
            if time.time() - self.entity_fail_cache[user_id] < ENTITY_FAIL_CACHE_TTL:
                return True
            del self.entity_fail_cache[user_id]
        return False

    def _mark_entity_failed(self, user_id: int):
        """Marca que get_entity falhou."""
        import time
        self.entity_fail_cache[user_id] = time.time()

    def _mark_pending_send(self, user_id: int):
        """Marca envio em progresso para user (chamar ANTES de enviar)."""
        import time
        self.pending_sends[user_id] = time.time()
        print(f"[API] Marcando pending send para user {user_id}")
        # Limpa antigos (mais de 30s)
        cutoff = time.time() - 30
        self.pending_sends = {k: v for k, v in self.pending_sends.items() if v > cutoff}

    def _mark_sent_via_api(self, msg_id: int, user_id: int):
        """Marca mensagem como enviada via API (para ignorar no handler Raw)."""
        import time
        self.sent_via_api[msg_id] = time.time()
        # Remove do pending
        if user_id in self.pending_sends:
            del self.pending_sends[user_id]
        # Limpa msgs antigas (mais de 60s)
        cutoff = time.time() - 60
        self.sent_via_api = {k: v for k, v in self.sent_via_api.items() if v > cutoff}

    def _was_sent_via_api(self, msg_id: int, user_id: int) -> bool:
        """Verifica se mensagem foi enviada via API (por msg_id ou pending send)."""
        import time
        # Verifica por msg_id
        if msg_id in self.sent_via_api:
            if time.time() - self.sent_via_api[msg_id] < 60:
                return True
            del self.sent_via_api[msg_id]
        # Verifica se há envio pendente para este user (race condition protection)
        if user_id in self.pending_sends:
            if time.time() - self.pending_sends[user_id] < 10:
                return True
            del self.pending_sends[user_id]
        return False

    def _should_update_presence(self, user_id: int, is_online: bool, is_typing: bool) -> bool:
        """Retorna True se deve gravar presence no DB."""
        import time
        now = time.time()
        
        if user_id in self.presence_cache:
            cached_online, cached_typing, ts = self.presence_cache[user_id]
            if cached_online == is_online and cached_typing == is_typing:
                if now - ts < PRESENCE_THROTTLE_SECONDS:
                    return False
        
        self.presence_cache[user_id] = (is_online, is_typing, now)
        return True

    async def start(self):
        """Inicia o worker com FastAPI + Telethon."""
        print("Telegram Worker iniciando...")
        
        # Registra este worker na API
        set_worker(self)
        
        # Cria loops do Telethon (NOTA: outbound removido - n8n controla via API)
        loops = {
            "sync": self._sync_loop,
            "history": self._history_sync_loop,
            "jobs": self._message_jobs_loop,
        }

        for name, factory in loops.items():
            task = asyncio.create_task(factory())
            self.watchdog.register(name, task, factory)

        # Configura servidor FastAPI
        config = uvicorn.Config(
            fastapi_app,
            host="0.0.0.0",
            port=WORKER_HTTP_PORT,
            log_level="info",
        )
        server = uvicorn.Server(config)

        print(f"[API] Servidor HTTP iniciando na porta {WORKER_HTTP_PORT}")
        await asyncio.gather(
            server.serve(),
            self.watchdog.monitor(),
            self._global_heartbeat_loop(),
        )

    async def _global_heartbeat_loop(self):
        """Heartbeat global - monitora status dos loops."""
        while True:
            try:
                status = self.watchdog.get_status()
                for loop_name, loop_status in status.items():
                    if not loop_status.get("alive", True):
                        print(f"[WATCHDOG-STATUS] Loop '{loop_name}' não está ativo: {loop_status}")
            except Exception as e:
                print(f"[HEARTBEAT-GLOBAL] Erro: {e}")
            await asyncio.sleep(30)

    async def _sync_loop(self):
        """Loop de sincronização de contas."""
        while True:
            try:
                self.watchdog.ping("sync")
                await self._sync_accounts()
                await asyncio.sleep(60)
            except Exception as e:
                print(f"Erro no sync loop: {e}")
                await asyncio.sleep(10)

    async def _sync_accounts(self):
        """Sincroniza contas ativas do banco."""
        db = get_supabase()

        result = await db_async(lambda: db.table("integration_accounts").select(
            "id, owner_id, secrets_encrypted, config, workspace_id"
        ).eq("type", "telegram_user").eq("is_active", True).execute())

        active_ids = set()

        for acc in result.data:
            acc_id = acc["id"]
            active_ids.add(acc_id)

            if acc_id not in self.clients:
                await self._connect_account(acc)

        for acc_id in list(self.clients.keys()):
            if acc_id not in active_ids:
                await self._disconnect_account(acc_id)

    async def _connect_account(self, account: dict):
        """Conecta uma conta Telegram."""
        acc_id = account["id"]
        owner_id = account["owner_id"]

        try:
            session_string = decrypt(account["secrets_encrypted"])

            client = TelegramClient(
                StringSession(session_string),
                self.api_id,
                self.api_hash,
                receive_updates=True,
            )

            await client.connect()
            await client.catch_up()

            if not await client.is_user_authorized():
                print(f"Conta {acc_id} não autorizada, removendo...")
                self._mark_account_error(acc_id, "Sessão expirada")
                await client.disconnect()
                return

            # Handler RAW para msgs instantâneas - ENVIA PARA n8n
            @client.on(events.Raw)
            async def handler_raw(update, _acc_id=acc_id, _owner_id=owner_id, _client=client):
                await self._handle_raw_update(_acc_id, _owner_id, _client, update)

            # Fallback para grupos - ENVIA PARA n8n
            @client.on(events.NewMessage)
            async def handler_new_message(event, _acc_id=acc_id, _owner_id=owner_id):
                await self._handle_new_message_fallback(_acc_id, _owner_id, event)

            # Presence - MANTÉM NO WORKER (direto Supabase)
            @client.on(events.UserUpdate)
            async def handler_user_update(event, _acc_id=acc_id, _owner_id=owner_id):
                await self._handle_user_update(_acc_id, _owner_id, event)

            # Inicia heartbeat
            hb = Heartbeat(
                owner_id=UUID(owner_id),
                integration_account_id=UUID(acc_id),
                worker_type="telegram",
            )
            await hb.start()

            self.clients[acc_id] = client
            self.heartbeats[acc_id] = hb
            self.account_info[acc_id] = {
                "owner_id": owner_id,
                "config": account.get("config", {}),
                "workspace_id": account.get("workspace_id"),
            }

            self.client_tasks[acc_id] = asyncio.create_task(
                self._run_client(acc_id, client)
            )

            print(f"Conta {acc_id} conectada")

            db = get_supabase()
            await db_async(lambda: db.table("integration_accounts").update({
                "last_sync_at": datetime.now(timezone.utc).isoformat(),
                "last_error": None,
            }).eq("id", acc_id).execute())

        except Exception as e:
            print(f"Erro ao conectar conta {acc_id}: {e}")
            self._mark_account_error(acc_id, str(e))

    async def _run_client(self, acc_id: str, client: TelegramClient):
        """Mantém cliente rodando."""
        try:
            await client.run_until_disconnected()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Erro no client loop {acc_id}: {e}")

    async def _disconnect_account(self, acc_id: str):
        """Desconecta uma conta."""
        if acc_id in self.client_tasks:
            self.client_tasks[acc_id].cancel()
            try:
                await self.client_tasks[acc_id]
            except asyncio.CancelledError:
                pass
            del self.client_tasks[acc_id]

        if acc_id in self.heartbeats:
            await self.heartbeats[acc_id].stop()
            del self.heartbeats[acc_id]

        if acc_id in self.clients:
            await self.clients[acc_id].disconnect()
            del self.clients[acc_id]

        if acc_id in self.account_info:
            del self.account_info[acc_id]

        print(f"Conta {acc_id} desconectada")

    def _mark_account_error(self, acc_id: str, error: str):
        """Marca erro na conta."""
        db = get_supabase()
        db.table("integration_accounts").update({
            "last_error": error,
        }).eq("id", acc_id).execute()

    # =============================================
    # HANDLERS DE MENSAGENS - ENVIAM PARA n8n
    # =============================================

    async def _handle_raw_update(self, acc_id: str, owner_id: str, client: TelegramClient, update):
        """Processa RAW updates - envia para n8n."""
        try:
            workspace_id = self.account_info.get(acc_id, {}).get("workspace_id")
            
            if isinstance(update, UpdateShortMessage):
                if update.out:
                    # Ignora se foi enviada via API (evita duplicata)
                    if self._was_sent_via_api(update.id, update.user_id):
                        print(f"[RAW] UpdateShortMessage OUT ignorada (via API): id={update.id}")
                        return
                    print(f"[RAW] UpdateShortMessage OUT: id={update.id} user={update.user_id}")
                    await self._notify_outbound(
                        acc_id, owner_id, workspace_id, client,
                        msg_id=update.id, user_id=update.user_id,
                        text=update.message, date=update.date, media=None
                    )
                else:
                    print(f"[RAW] UpdateShortMessage IN: id={update.id} user={update.user_id}")
                    await self._notify_inbound(
                        acc_id, owner_id, workspace_id, client,
                        msg_id=update.id, user_id=update.user_id,
                        text=update.message, date=update.date, media=None
                    )

            elif isinstance(update, UpdateNewMessage):
                msg = update.message
                if hasattr(msg, 'peer_id') and isinstance(msg.peer_id, PeerUser):
                    if hasattr(msg, 'out') and msg.out:
                        # Ignora se foi enviada via API (evita duplicata)
                        if self._was_sent_via_api(msg.id, msg.peer_id.user_id):
                            print(f"[RAW] UpdateNewMessage OUT ignorada (via API): id={msg.id}")
                            return
                        print(f"[RAW] UpdateNewMessage OUT: id={msg.id}")
                        await self._notify_outbound(
                            acc_id, owner_id, workspace_id, client,
                            msg_id=msg.id, user_id=msg.peer_id.user_id,
                            text=msg.message if hasattr(msg, 'message') else None,
                            date=msg.date, media=getattr(msg, 'media', None)
                        )
                    elif hasattr(msg, 'from_id') and isinstance(msg.from_id, PeerUser):
                        print(f"[RAW] UpdateNewMessage IN: id={msg.id}")
                        await self._notify_inbound(
                            acc_id, owner_id, workspace_id, client,
                            msg_id=msg.id, user_id=msg.from_id.user_id,
                            text=msg.message if hasattr(msg, 'message') else None,
                            date=msg.date, media=getattr(msg, 'media', None)
                        )

        except Exception as e:
            import traceback
            print(f"[RAW] Erro: {e}")
            traceback.print_exc()

    async def _notify_inbound(
        self, acc_id: str, owner_id: str, workspace_id: str | None,
        client: TelegramClient, msg_id: int, user_id: int, text: str, date, media
    ):
        """Notifica n8n sobre mensagem recebida."""
        sender_data = await self._get_sender_data(client, user_id)
        media_info = await self._process_media_for_webhook(client, media, msg_id) if media else None
        
        content = {
            "text": text or "",
            "media_url": media_info.get("url") if media_info else None,
            "media_type": media_info.get("type") if media_info else None,
            "media_name": media_info.get("name") if media_info else None,
        }
        
        await notify_inbound_message(
            account_id=acc_id,
            owner_id=owner_id,
            workspace_id=workspace_id,
            telegram_user_id=user_id,
            telegram_msg_id=msg_id,
            sender=sender_data,
            content=content,
            timestamp=date if date else datetime.now(timezone.utc),
            is_group=False,
        )

    async def _notify_outbound(
        self, acc_id: str, owner_id: str, workspace_id: str | None,
        client: TelegramClient, msg_id: int, user_id: int, text: str, date, media
    ):
        """Notifica n8n sobre mensagem enviada (capturada do Telegram)."""
        # Busca dados do destinatário (nome, username, etc)
        recipient_data = await self._get_sender_data(client, user_id)
        
        media_info = await self._process_media_for_webhook(client, media, msg_id) if media else None
        
        content = {
            "text": text or "",
            "media_url": media_info.get("url") if media_info else None,
            "media_type": media_info.get("type") if media_info else None,
            "media_name": media_info.get("name") if media_info else None,
        }
        
        await notify_outbound_message(
            account_id=acc_id,
            owner_id=owner_id,
            workspace_id=workspace_id,
            telegram_user_id=user_id,
            telegram_msg_id=msg_id,
            recipient=recipient_data,
            content=content,
            timestamp=date if date else datetime.now(timezone.utc),
            is_group=False,
        )

    async def _get_sender_data(self, client: TelegramClient, user_id: int) -> dict:
        """Busca dados do sender do Telegram incluindo foto de perfil."""
        sender_data = {
            "telegram_user_id": user_id,
            "first_name": None,
            "last_name": None,
            "username": None,
            "access_hash": None,
            "photo_url": None,
        }
        
        entity = None
        
        # 1. Verifica cache
        cached = self._get_cached_entity(user_id)
        if cached and isinstance(cached, User):
            entity = cached
            print(f"[SENDER] Cache hit: {user_id} = {cached.first_name}")
        
        # 2. Tenta get_entity
        if not entity and not self._is_entity_failed(user_id):
            try:
                result = await telegram_op(
                    client.get_entity(user_id),
                    TIMEOUT_TELEGRAM_ENTITY,
                    f"get_entity({user_id})"
                )
                if result and isinstance(result, User):
                    entity = result
                    self._cache_entity(user_id, entity)
                    print(f"[SENDER] get_entity ok: {user_id} = {entity.first_name}")
            except Exception as e:
                print(f"[SENDER] get_entity erro: {user_id} - {e}")
        
        # 3. Tenta buscar nos dialogs (fallback)
        if not entity:
            try:
                async for dialog in client.iter_dialogs(limit=100):
                    if dialog.entity and hasattr(dialog.entity, 'id') and dialog.entity.id == user_id:
                        if isinstance(dialog.entity, User):
                            entity = dialog.entity
                            self._cache_entity(user_id, entity)
                            print(f"[SENDER] dialog fallback ok: {user_id} = {entity.first_name}")
                            break
            except Exception as e:
                print(f"[SENDER] iter_dialogs erro: {e}")
        
        # Preenche dados se encontrou entity
        if entity:
            sender_data["first_name"] = entity.first_name
            sender_data["last_name"] = entity.last_name
            sender_data["username"] = entity.username
            sender_data["access_hash"] = entity.access_hash
            
            # Busca foto de perfil
            photo_url = await self._download_profile_photo(client, entity, user_id)
            if photo_url:
                sender_data["photo_url"] = photo_url
        else:
            self._mark_entity_failed(user_id)
            print(f"[SENDER] Não conseguiu dados para: {user_id}")
        
        return sender_data

    async def _download_profile_photo(self, client: TelegramClient, entity, user_id: int) -> str | None:
        """Baixa foto de perfil e faz upload para Supabase."""
        try:
            # Baixa foto em bytes
            photo_bytes = await client.download_profile_photo(entity, file=bytes)
            if not photo_bytes:
                print(f"[PHOTO] Usuário {user_id} não tem foto de perfil")
                return None
            
            # Upload para Supabase Storage
            storage_path = f"avatars/telegram/{user_id}.jpg"
            
            supabase_url = os.environ["SUPABASE_URL"]
            supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
            storage_client = create_supabase_client(supabase_url, supabase_key)
            
            # Tenta remover se já existe (para atualizar)
            try:
                storage_client.storage.from_("avatars").remove([storage_path])
            except Exception:
                pass
            
            # Upload
            storage_client.storage.from_("avatars").upload(
                storage_path,
                photo_bytes,
                {"content-type": "image/jpeg", "upsert": "true"}
            )
            
            public_url = f"{supabase_url}/storage/v1/object/public/avatars/{storage_path}"
            print(f"[PHOTO] Foto de {user_id} salva: {public_url}")
            return public_url
            
        except Exception as e:
            print(f"[PHOTO] Erro ao baixar foto de {user_id}: {e}")
            return None

    async def _get_group_data(self, client: TelegramClient, chat) -> dict:
        """Busca dados do grupo/canal incluindo foto."""
        group_data = {
            "telegram_id": chat.id,
            "title": getattr(chat, 'title', None) or f"Grupo {chat.id}",
            "username": getattr(chat, 'username', None),
            "participant_count": None,
            "photo_url": None,
            "is_megagroup": getattr(chat, 'megagroup', False),
            "is_channel": isinstance(chat, Channel) and not getattr(chat, 'megagroup', False),
        }
        
        # Tenta buscar contagem de participantes
        try:
            participants = await client.get_participants(chat, limit=0)
            group_data["participant_count"] = participants.total
        except Exception as e:
            print(f"[GROUP] Erro ao buscar participantes: {e}")
        
        # Baixa foto do grupo
        try:
            photo_bytes = await client.download_profile_photo(chat, file=bytes)
            if photo_bytes:
                storage_path = f"avatars/telegram/group_{chat.id}.jpg"
                
                supabase_url = os.environ["SUPABASE_URL"]
                supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
                storage_client = create_supabase_client(supabase_url, supabase_key)
                
                try:
                    storage_client.storage.from_("avatars").remove([storage_path])
                except Exception:
                    pass
                
                storage_client.storage.from_("avatars").upload(
                    storage_path,
                    photo_bytes,
                    {"content-type": "image/jpeg", "upsert": "true"}
                )
                
                group_data["photo_url"] = f"{supabase_url}/storage/v1/object/public/avatars/{storage_path}"
                print(f"[GROUP] Foto do grupo {chat.id} salva")
        except Exception as e:
            print(f"[GROUP] Erro ao baixar foto do grupo: {e}")
        
        return group_data

    async def _process_service_message(self, msg) -> dict | None:
        """Processa mensagens de servico (join, leave, title change, etc)."""
        if not isinstance(msg, MessageService):
            return None
        
        action = msg.action
        service_data = {
            "service_type": None,
            "user_ids": [],
            "text": None,
        }
        
        if isinstance(action, MessageActionChatJoinedByLink):
            service_data["service_type"] = "join"
            if hasattr(msg, 'from_id') and msg.from_id:
                service_data["user_ids"] = [msg.from_id.user_id]
            service_data["text"] = "entrou no grupo via link"
            
        elif isinstance(action, MessageActionChatAddUser):
            service_data["service_type"] = "join"
            service_data["user_ids"] = list(action.users)
            service_data["text"] = "foi adicionado ao grupo"
            
        elif isinstance(action, MessageActionChatJoinedByRequest):
            service_data["service_type"] = "join"
            if hasattr(msg, 'from_id') and msg.from_id:
                service_data["user_ids"] = [msg.from_id.user_id]
            service_data["text"] = "entrou no grupo por solicitacao"
            
        elif isinstance(action, MessageActionChatDeleteUser):
            service_data["service_type"] = "leave"
            service_data["user_ids"] = [action.user_id]
            service_data["text"] = "saiu do grupo"
            
        else:
            return None
        
        return service_data

    async def _process_media_for_webhook(self, client: TelegramClient, media, msg_id: int) -> dict | None:
        """Processa mídia e faz upload para Supabase."""
        try:
            from telethon.tl.types import DocumentAttributeAudio, DocumentAttributeFilename
            
            media_bytes = await client.download_media(media, file=bytes)
            if not media_bytes:
                return None
            
            file_name = f"media_{msg_id}"
            mime_type = "application/octet-stream"
            
            if hasattr(media, "photo"):
                file_name = f"photo_{msg_id}.jpg"
                mime_type = "image/jpeg"
            elif hasattr(media, "document"):
                doc = media.document
                mime_type = doc.mime_type or "application/octet-stream"
                
                for attr in doc.attributes:
                    if isinstance(attr, DocumentAttributeFilename):
                        file_name = attr.file_name
                        break
                    elif isinstance(attr, DocumentAttributeAudio):
                        if getattr(attr, "voice", False):
                            file_name = f"voice_{msg_id}.ogg"
                            mime_type = "audio/ogg"
                        break
                else:
                    ext = mime_type.split("/")[-1] if "/" in mime_type else "bin"
                    file_name = f"file_{msg_id}.{ext}"
            
            storage_path = f"telegram/webhook/{msg_id}/{file_name}"
            
            supabase_url = os.environ["SUPABASE_URL"]
            supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
            storage_client = create_supabase_client(supabase_url, supabase_key)
            
            storage_client.storage.from_("attachments").upload(
                storage_path,
                media_bytes,
                {"content-type": mime_type}
            )
            
            public_url = f"{supabase_url}/storage/v1/object/public/attachments/{storage_path}"
            
            return {
                "url": public_url,
                "type": mime_type,
                "name": file_name,
                "size": len(media_bytes),
            }
            
        except Exception as e:
            print(f"[MEDIA] Erro: {e}")
            return None

    async def _handle_new_message_fallback(self, acc_id: str, owner_id: str, event):
        """Fallback para grupos - envia para n8n com dados completos."""
        try:
            msg = event.message
            is_outgoing = msg.out
            workspace_id = self.account_info.get(acc_id, {}).get("workspace_id")
            
            chat = await event.get_chat()
            is_group = isinstance(chat, (Chat, Channel))
            
            # Debug log
            chat_id = getattr(chat, 'id', 'unknown')
            chat_title = getattr(chat, 'title', None) or getattr(chat, 'first_name', 'unknown')
            print(f"[NewMessage] chat_id={chat_id} title={chat_title} is_group={is_group} out={is_outgoing}")
            
            if not is_group:
                return  # 1:1 handled by Raw handler
            
            client = self.clients[acc_id]
            
            # Detecta MessageService (join/leave/etc)
            if isinstance(msg, MessageService):
                service_data = await self._process_service_message(msg)
                if service_data:
                    group_data = await self._get_group_data(client, chat)
                    
                    content = {
                        "text": service_data.get("text"),
                        "service_event": service_data,
                    }
                    
                    await notify_inbound_message(
                        account_id=acc_id,
                        owner_id=owner_id,
                        workspace_id=workspace_id,
                        telegram_user_id=chat.id,
                        telegram_msg_id=msg.id,
                        sender=None,
                        content=content,
                        timestamp=msg.date,
                        is_group=True,
                        group_info=group_data,
                        message_type="service",
                    )
                return
            
            # Mensagem normal de grupo
            group_data = await self._get_group_data(client, chat)
            
            # Busca dados do remetente (se inbound)
            sender_data = None
            if not is_outgoing:
                sender = await event.get_sender()
                if sender:
                    sender_data = {
                        "telegram_user_id": sender.id,
                        "first_name": getattr(sender, 'first_name', None),
                        "last_name": getattr(sender, 'last_name', None),
                        "username": getattr(sender, 'username', None),
                    }
                    # Busca foto do sender
                    photo_url = await self._download_profile_photo(client, sender, sender.id)
                    if photo_url:
                        sender_data["photo_url"] = photo_url
            
            # Processa midia
            media_info = await self._process_media_for_webhook(
                client, msg.media, msg.id
            ) if msg.media else None
            
            message_type = "media" if media_info else "text"
            
            content = {
                "text": msg.text or "",
                "media_url": media_info.get("url") if media_info else None,
                "media_type": media_info.get("type") if media_info else None,
                "media_name": media_info.get("name") if media_info else None,
            }
            
            if is_outgoing:
                await notify_outbound_message(
                    account_id=acc_id,
                    owner_id=owner_id,
                    workspace_id=workspace_id,
                    telegram_user_id=chat.id,
                    telegram_msg_id=msg.id,
                    content=content,
                    timestamp=msg.date,
                    is_group=True,
                    group_info=group_data,
                )
            else:
                await notify_inbound_message(
                    account_id=acc_id,
                    owner_id=owner_id,
                    workspace_id=workspace_id,
                    telegram_user_id=chat.id,
                    telegram_msg_id=msg.id,
                    sender=sender_data,
                    content=content,
                    timestamp=msg.date,
                    is_group=True,
                    group_info=group_data,
                    message_type=message_type,
                )
                    
        except Exception as e:
            import traceback
            print(f"[FALLBACK] Erro: {e}")
            traceback.print_exc()
    # =============================================
    # PRESENCE - MANTÉM NO WORKER (direto Supabase)
    # =============================================

    async def _handle_user_update(self, acc_id: str, owner_id: str, event):
        """Processa eventos de presence - grava direto no Supabase."""
        try:
            user_id = event.user_id
            now = datetime.now(timezone.utc)

            is_typing = False
            is_online = None
            last_seen = None
            typing_expires = None

            if hasattr(event, 'typing') and event.typing:
                is_typing = True
                typing_expires = (now + timedelta(seconds=5)).isoformat()

            if hasattr(event, 'status'):
                status = event.status
                if isinstance(status, UserStatusOnline):
                    is_online = True
                    last_seen = now.isoformat()
                elif isinstance(status, UserStatusOffline):
                    is_online = False
                    if hasattr(status, 'was_online'):
                        last_seen = status.was_online.isoformat()
                elif isinstance(status, UserStatusRecently):
                    is_online = False
                    last_seen = now.isoformat()

            if not self._should_update_presence(user_id, is_online or False, is_typing):
                return

            db = get_supabase()

            identity_result = await db_async(lambda: db.table("contact_identities").select(
                "id"
            ).eq("owner_id", owner_id).eq(
                "type", "telegram_user"
            ).eq("value", str(user_id)).execute())

            if not identity_result.data:
                return

            identity_id = identity_result.data[0]["id"]

            conv_result = await db_async(lambda: db.table("conversations").select("id").eq(
                "primary_identity_id", identity_id
            ).execute())

            conversation_id = conv_result.data[0]["id"] if conv_result.data else None

            await db_async(lambda: db.table("presence_status").upsert({
                "owner_id": owner_id,
                "contact_identity_id": identity_id,
                "conversation_id": conversation_id,
                "is_typing": is_typing,
                "is_online": is_online if is_online is not None else False,
                "last_seen_at": last_seen,
                "typing_expires_at": typing_expires,
                "updated_at": now.isoformat(),
            }, on_conflict="owner_id,contact_identity_id").execute())

            if is_typing:
                print(f"[PRESENCE] Usuário {user_id} digitando")
            elif is_online is not None:
                print(f"[PRESENCE] Usuário {user_id} {'online' if is_online else 'offline'}")

        except Exception as e:
            print(f"[PRESENCE] Erro: {e}")

    # =============================================
    # SYNC HISTÓRICO - MANTÉM NO WORKER
    # =============================================

    async def _history_sync_loop(self):
        """Loop para processar jobs de sync de histórico."""
        await asyncio.sleep(10)
        print("[SYNC] Loop de sync iniciado")

        while True:
            try:
                self.watchdog.ping("history")
                if not self.clients:
                    await asyncio.sleep(5)
                    continue

                await self._process_history_sync_jobs()
                await asyncio.sleep(5)
            except Exception as e:
                print(f"Erro no history sync loop: {e}")
                await asyncio.sleep(10)

    async def _process_history_sync_jobs(self):
        """Processa jobs de sync pendentes."""
        db = get_supabase()

        result = db.table("sync_history_jobs").select(
            "id, owner_id, conversation_id, integration_account_id, limit_messages, "
            "telegram_id, telegram_name, workspace_id, is_group"
        ).eq("status", "pending").order("created_at").limit(1).execute()

        for job in result.data:
            await self._process_single_history_job(db, job)
            await asyncio.sleep(2)

    async def _process_single_history_job(self, db, job: dict):
        """Processa job de sync - envia batch para n8n."""
        job_id = job["id"]
        owner_id = job["owner_id"]
        acc_id = job["integration_account_id"]
        limit = job.get("limit_messages", 100)
        telegram_id = job.get("telegram_id")
        workspace_id = job.get("workspace_id")
        conversation_id = job.get("conversation_id")

        print(f"[SYNC] Processando job {job_id}")

        db.table("sync_history_jobs").update({
            "status": "processing",
        }).eq("id", job_id).execute()

        try:
            if acc_id not in self.clients:
                raise Exception(f"Conta {acc_id} não conectada")

            client = self.clients[acc_id]
            telegram_user_id = None
            entity = None
            is_group = False

            # Resolve entity do Telegram
            if telegram_id:
                telegram_user_id = int(telegram_id)
                entity = await self._resolve_telegram_entity(client, telegram_user_id)
                if not entity:
                    raise Exception(f"Entidade {telegram_user_id} não encontrada")
                is_group = isinstance(entity, (Chat, Channel))
            else:
                if not conversation_id:
                    raise Exception("Job sem telegram_id nem conversation_id")

                conv_result = db.table("conversations").select(
                    "primary_identity_id"
                ).eq("id", conversation_id).single().execute()

                if not conv_result.data:
                    raise Exception("Conversa não encontrada")

                identity_result = db.table("contact_identities").select(
                    "value, metadata"
                ).eq("id", conv_result.data["primary_identity_id"]).single().execute()

                if not identity_result.data:
                    raise Exception("Identity não encontrada")

                telegram_user_id = int(identity_result.data["value"])
                is_group = identity_result.data.get("metadata", {}).get("is_group", False)

                entity = await self._resolve_telegram_entity(client, telegram_user_id)
                if not entity:
                    raise Exception(f"Entidade {telegram_user_id} não encontrada")

            # Busca dados do contato ou grupo (incluindo foto)
            if is_group:
                group_data = await self._get_group_data(client, entity)
                sender_data = {
                    "telegram_user_id": telegram_user_id,
                    "title": group_data.get("title"),
                    "username": group_data.get("username"),
                    "photo_url": group_data.get("photo_url"),
                    "participant_count": group_data.get("participant_count"),
                    "is_group": True,
                }
            else:
                sender_data = await self._get_sender_data(client, telegram_user_id)

            # Coleta mensagens do Telegram
            messages_batch = []
            three_months_ago = datetime.now(timezone.utc) - timedelta(days=90)

            async for msg in client.iter_messages(entity, limit=limit):
                if msg.date.replace(tzinfo=timezone.utc) < three_months_ago:
                    continue

                # Processa MessageService para grupos (join/leave)
                if isinstance(msg, MessageService) and is_group:
                    service_data = await self._process_service_message(msg)
                    if service_data:
                        messages_batch.append({
                            "id": str(uuid4()),
                            "telegram_msg_id": msg.id,
                            "text": service_data.get("text"),
                            "date": msg.date.isoformat(),
                            "direction": "inbound",
                            "message_type": "service",
                            "service_event": service_data,
                            "sender_telegram_id": service_data["user_ids"][0] if service_data.get("user_ids") else None,
                            "sender_name": None,
                        })
                    continue

                if not msg.text and not msg.media:
                    continue

                direction = "outbound" if msg.out else "inbound"
                
                # Para grupos: captura sender de cada mensagem
                sender_telegram_id = None
                sender_name = None
                if is_group and not msg.out:
                    if hasattr(msg, 'from_id') and msg.from_id:
                        sender_telegram_id = msg.from_id.user_id if hasattr(msg.from_id, 'user_id') else None
                        # Tenta buscar nome do sender
                        try:
                            sender_entity = await client.get_entity(sender_telegram_id)
                            if sender_entity:
                                sender_name = getattr(sender_entity, 'first_name', '') or ''
                                if getattr(sender_entity, 'last_name', None):
                                    sender_name += f" {sender_entity.last_name}"
                        except Exception:
                            pass
                
                # Processa midia se houver
                media_info = None
                if msg.media:
                    media_info = await self._process_media_for_webhook(client, msg.media, msg.id)

                message_type = "media" if media_info else "text"

                messages_batch.append({
                    "id": str(uuid4()),
                    "telegram_msg_id": msg.id,
                    "text": msg.text or None,
                    "date": msg.date.isoformat(),
                    "direction": direction,
                    "message_type": message_type,
                    "media_url": media_info.get("url") if media_info else None,
                    "media_type": media_info.get("type") if media_info else None,
                    "media_name": media_info.get("name") if media_info else None,
                    "sender_telegram_id": sender_telegram_id,
                    "sender_name": sender_name,
                })

            if not messages_batch:
                print(f"[SYNC] Nenhuma mensagem nova para sincronizar")
                db.table("sync_history_jobs").update({
                    "status": "completed",
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "messages_synced": 0,
                }).eq("id", job_id).execute()
                return

            # Envia batch para n8n
            result = await notify_sync_batch(
                account_id=acc_id,
                owner_id=owner_id,
                workspace_id=workspace_id,
                job_id=job_id,
                telegram_user_id=telegram_user_id,
                is_group=is_group,
                sender=sender_data,
                messages=messages_batch,
            )

            if result and result.get("status") == "ok":
                messages_inserted = result.get("messages_inserted", len(messages_batch))
                conversation_id = result.get("conversation_id")
                
                db.table("sync_history_jobs").update({
                    "status": "completed",
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "messages_synced": messages_inserted,
                    "conversation_id": conversation_id,
                }).eq("id", job_id).execute()

                print(f"[SYNC] Job {job_id} concluído: {messages_inserted} mensagens via n8n")
            else:
                raise Exception(f"n8n retornou erro: {result}")

        except Exception as e:
            import traceback
            print(f"[SYNC] Erro no job {job_id}: {e}")
            traceback.print_exc()

            db.table("sync_history_jobs").update({
                "status": "failed",
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "error_message": str(e),
            }).eq("id", job_id).execute()

    async def _resolve_telegram_entity(self, client, telegram_id: int):
        """Resolve entidade do Telegram."""
        try:
            entity = await client.get_entity(telegram_id)
            if entity:
                return entity
        except Exception as e:
            print(f"[SYNC] get_entity falhou: {e}")

        try:
            input_entity = await client.get_input_entity(telegram_id)
            if input_entity:
                entity = await client.get_entity(input_entity)
                if entity:
                    return entity
        except Exception as e:
            print(f"[SYNC] get_input_entity falhou: {e}")

        try:
            async for dialog in client.iter_dialogs(limit=None):
                if dialog.entity and hasattr(dialog.entity, 'id') and dialog.entity.id == telegram_id:
                    return dialog.entity
        except Exception as e:
            print(f"[SYNC] iter_dialogs falhou: {e}")

        return None



    # =============================================
    # MESSAGE JOBS - MANTÉM NO WORKER
    # =============================================

    async def _message_jobs_loop(self):
        """Loop para processar jobs de edit/delete."""
        await asyncio.sleep(5)

        while True:
            try:
                self.watchdog.ping("jobs")
                if not self.clients:
                    await asyncio.sleep(2)
                    continue

                await self._process_message_jobs()
                await asyncio.sleep(2)
            except Exception as e:
                print(f"Erro no message jobs loop: {e}")
                await asyncio.sleep(5)

    async def _process_message_jobs(self):
        """Processa jobs de edit/delete pendentes."""
        db = get_supabase()

        result = db.table("message_jobs").select(
            "id, owner_id, message_id, integration_account_id, action, payload, status"
        ).eq("status", "pending").order("created_at").limit(10).execute()

        for job in result.data:
            await self._process_single_message_job(db, job)

    async def _process_single_message_job(self, db, job: dict):
        """Processa um job de edit/delete."""
        job_id = job["id"]
        action = job["action"]
        acc_id = job.get("integration_account_id")
        payload = job.get("payload", {})

        print(f"[JOB] Processando {action} job {job_id}")

        db.table("message_jobs").update({
            "status": "processing",
        }).eq("id", job_id).execute()

        try:
            if not acc_id or acc_id not in self.clients:
                raise Exception(f"Conta {acc_id} não conectada")

            client = self.clients[acc_id]

            if action == "typing":
                telegram_user_id = payload.get("telegram_user_id")
                if not telegram_user_id:
                    raise Exception("telegram_user_id não encontrado")

                from telethon.tl.functions.messages import SetTypingRequest
                from telethon.tl.types import SendMessageTypingAction
                await client(SetTypingRequest(peer=int(telegram_user_id), action=SendMessageTypingAction()))

                db.table("message_jobs").update({
                    "status": "completed",
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", job_id).execute()
                return

            external_msg_id = payload.get("external_message_id")
            if not external_msg_id or external_msg_id.startswith("local-") or external_msg_id.startswith("error-"):
                raise Exception(f"ID externo inválido: {external_msg_id}")

            msg_id = int(external_msg_id)

            message_result = db.table("messages").select(
                "identity_id"
            ).eq("id", job["message_id"]).single().execute()

            if not message_result.data:
                raise Exception("Mensagem não encontrada")

            identity_id = message_result.data["identity_id"]

            identity_result = db.table("contact_identities").select(
                "value"
            ).eq("id", identity_id).single().execute()

            if not identity_result.data:
                raise Exception("Identity não encontrada")

            telegram_user_id = int(identity_result.data["value"])

            if action == "edit":
                new_text = payload.get("new_text", "")
                if not new_text:
                    raise Exception("Texto vazio")

                await client.edit_message(telegram_user_id, msg_id, new_text)
                print(f"[JOB] Mensagem {msg_id} editada")

            elif action == "delete":
                await client.delete_messages(telegram_user_id, [msg_id])
                print(f"[JOB] Mensagem {msg_id} deletada")

            else:
                raise Exception(f"Ação desconhecida: {action}")

            db.table("message_jobs").update({
                "status": "completed",
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", job_id).execute()

        except Exception as e:
            import traceback
            print(f"[JOB] Erro: {e}")
            traceback.print_exc()

            db.table("message_jobs").update({
                "status": "failed",
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "error_message": str(e),
            }).eq("id", job_id).execute()


async def main():
    worker = TelegramWorker()
    await worker.start()


if __name__ == "__main__":
    asyncio.run(main())
