"""
Worker Telegram - Recebe e envia mensagens via Telethon

Uso:
    python worker.py

Env vars necessárias:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    ENCRYPTION_KEY
    TELEGRAM_API_ID, TELEGRAM_API_HASH
"""

import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from uuid import UUID, uuid4

from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.tl.types import (
    User, PeerUser, MessageService, Chat, Channel,
    MessageActionChatJoinedByLink, MessageActionChatAddUser,
    MessageActionChatDeleteUser, MessageActionChatJoinedByRequest,
    UserStatusOnline, UserStatusOffline, UserStatusRecently,
)
from telethon.tl.functions.messages import ReadHistoryRequest

# Adiciona shared ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.db import get_supabase
from shared.crypto import decrypt
from shared.heartbeat import Heartbeat
from supabase import create_client as create_supabase_client

load_dotenv()


class TelegramWorker:
    def __init__(self):
        self.api_id = int(os.environ["TELEGRAM_API_ID"])
        self.api_hash = os.environ["TELEGRAM_API_HASH"]
        self.clients: dict[str, TelegramClient] = {}
        self.client_tasks: dict[str, asyncio.Task] = {}  # Tasks para run_until_disconnected
        self.heartbeats: dict[str, Heartbeat] = {}
        self.account_info: dict[str, dict] = {}  # acc_id -> {owner_id, ...}

    async def start(self):
        print("Telegram Worker iniciando...")

        # Inicia loop de sincronização, envio, sync histórico e jobs em paralelo
        await asyncio.gather(
            self._sync_loop(),
            self._outbound_loop(),
            self._history_sync_loop(),
            self._message_jobs_loop(),
        )

    async def _sync_loop(self):
        """Loop de sincronização de contas."""
        while True:
            try:
                await self._sync_accounts()
                await asyncio.sleep(60)
            except Exception as e:
                print(f"Erro no sync loop: {e}")
                await asyncio.sleep(10)

    async def _outbound_loop(self):
        """Loop de envio de mensagens outbound."""
        while True:
            try:
                await self._process_outbound_messages()
                await asyncio.sleep(2)  # Verifica a cada 2s
            except Exception as e:
                print(f"Erro no outbound loop: {e}")
                await asyncio.sleep(5)

    async def _sync_accounts(self):
        """Sincroniza contas ativas do banco."""
        db = get_supabase()

        result = db.table("integration_accounts").select(
            "id, owner_id, secrets_encrypted, config"
        ).eq("type", "telegram_user").eq("is_active", True).execute()

        active_ids = set()

        for acc in result.data:
            acc_id = acc["id"]
            active_ids.add(acc_id)

            if acc_id not in self.clients:
                await self._connect_account(acc)

        # Desconecta contas removidas/desativadas
        for acc_id in list(self.clients.keys()):
            if acc_id not in active_ids:
                await self._disconnect_account(acc_id)

    async def _connect_account(self, account: dict):
        """Conecta uma conta Telegram."""
        acc_id = account["id"]
        owner_id = account["owner_id"]

        try:
            # Descriptografa sessão
            session_string = decrypt(account["secrets_encrypted"])

            client = TelegramClient(
                StringSession(session_string),
                self.api_id,
                self.api_hash,
            )

            await client.connect()

            if not await client.is_user_authorized():
                print(f"Conta {acc_id} não autorizada, removendo...")
                self._mark_account_error(acc_id, "Sessão expirada")
                await client.disconnect()
                return

            # Registra handlers (usa default args para capturar valores)
            @client.on(events.NewMessage(incoming=True))
            async def handler_incoming(event, _acc_id=acc_id, _owner_id=owner_id):
                print(f"[DEBUG] Mensagem recebida para conta {_acc_id}")
                await self._handle_incoming_message(_acc_id, _owner_id, event)

            # Handler para mensagens enviadas pelo próprio usuário (em outros apps)
            @client.on(events.NewMessage(outgoing=True))
            async def handler_outgoing(event, _acc_id=acc_id, _owner_id=owner_id):
                print(f"[DEBUG] Mensagem enviada pelo usuário para conta {_acc_id}")
                await self._handle_outgoing_message(_acc_id, _owner_id, event)

            # Handler para ações de chat (entrada/saída de membros, etc)
            @client.on(events.ChatAction)
            async def handler_chat_action(event, _acc_id=acc_id, _owner_id=owner_id):
                print(f"[DEBUG] Chat action para conta {_acc_id}")
                await self._handle_chat_action(_acc_id, _owner_id, event)

            # Handler para mensagens lidas (read receipts)
            @client.on(events.MessageRead)
            async def handler_message_read(event, _acc_id=acc_id, _owner_id=owner_id):
                await self._handle_message_read(_acc_id, _owner_id, event)

            # Handler para typing indicator
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
            }

            # Inicia task para receber eventos
            self.client_tasks[acc_id] = asyncio.create_task(
                self._run_client(acc_id, client)
            )

            print(f"Conta {acc_id} conectada")

            # Atualiza last_sync_at
            db = get_supabase()
            db.table("integration_accounts").update({
                "last_sync_at": datetime.now(timezone.utc).isoformat(),
                "last_error": None,
            }).eq("id", acc_id).execute()

        except Exception as e:
            print(f"Erro ao conectar conta {acc_id}: {e}")
            self._mark_account_error(acc_id, str(e))

    async def _run_client(self, acc_id: str, client: TelegramClient):
        """Mantém cliente rodando para receber eventos."""
        try:
            await client.run_until_disconnected()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Erro no client loop {acc_id}: {e}")

    async def _disconnect_account(self, acc_id: str):
        """Desconecta uma conta."""
        # Cancela task do cliente
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

    async def _process_outbound_messages(self):
        """Processa mensagens outbound pendentes."""
        db = get_supabase()

        # Busca mensagens outbound não enviadas (sem external_message_id real)
        # Mensagens do frontend têm external_message_id começando com "local-"
        result = db.table("messages").select(
            "id, conversation_id, integration_account_id, identity_id, text, channel, sent_at"
        ).eq("direction", "outbound").eq(
            "channel", "telegram"
        ).like("external_message_id", "local-%").limit(10).execute()

        for msg in result.data:
            await self._send_telegram_message(msg)

    async def _send_telegram_message(self, message: dict):
        """Envia uma mensagem via Telegram (com suporte a mídia)."""
        acc_id = message.get("integration_account_id")

        if not acc_id or acc_id not in self.clients:
            return  # Conta não conectada ainda, tenta novamente depois

        client = self.clients[acc_id]
        db = get_supabase()

        text = message.get("text") or ""
        message_id = message["id"]

        # Verifica idade da mensagem (para aguardar vinculação de attachments)
        sent_at_str = message.get("sent_at")
        age_seconds = 999
        if sent_at_str:
            from datetime import datetime
            try:
                sent_at = datetime.fromisoformat(sent_at_str.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                age_seconds = (now - sent_at).total_seconds()
            except Exception:
                pass

        # Busca attachments da mensagem
        att_result = db.table("attachments").select(
            "id, storage_bucket, storage_path, file_name, mime_type"
        ).eq("message_id", message_id).execute()

        attachments = att_result.data or []

        # Se mensagem é muito nova (< 3s) e não tem attachments, aguarda vinculação
        # (API pode não ter terminado de vincular ainda)
        if not attachments and age_seconds < 3:
            print(f"Mensagem {message_id} muito nova ({age_seconds:.1f}s), aguardando vinculação de attachments")
            return  # Pula, tenta novamente no próximo ciclo

        # Se não tem texto nem attachments após aguardar
        if not text.strip() and not attachments:
            if age_seconds < 10:
                print(f"Mensagem {message_id} sem conteúdo, aguardando ({age_seconds:.1f}s)")
                return  # Pula, tenta novamente no próximo ciclo

            print(f"Mensagem {message_id} sem texto nem mídia, marcando como erro")
            db.table("messages").update({
                "external_message_id": f"error-empty-{message_id}",
            }).eq("id", message_id).execute()
            return

        try:
            # Busca telegram_user_id do destinatário
            identity_result = db.table("contact_identities").select(
                "value"
            ).eq("id", message["identity_id"]).execute()

            if not identity_result.data:
                print(f"Identity {message['identity_id']} não encontrada")
                return

            telegram_user_id = int(identity_result.data[0]["value"])

            sent = None

            # Se tem attachments, envia com mídia
            if attachments:
                sent = await self._send_with_attachments(
                    client, telegram_user_id, text, attachments, db
                )
            else:
                # Apenas texto
                sent = await client.send_message(telegram_user_id, text)

            if sent:
                # Atualiza external_message_id com ID real
                db.table("messages").update({
                    "external_message_id": str(sent.id),
                }).eq("id", message_id).execute()
                print(f"Mensagem enviada para {telegram_user_id}")
            else:
                raise Exception("Falha ao enviar mensagem")

        except Exception as e:
            print(f"Erro ao enviar mensagem {message_id}: {e}")
            import traceback
            traceback.print_exc()
            # Marca erro na mensagem
            db.table("messages").update({
                "external_message_id": f"error-{message_id}",
            }).eq("id", message_id).execute()

    def _convert_webm_to_ogg(self, webm_bytes: bytes) -> bytes | None:
        """Converte WebM para OGG Opus usando FFmpeg (requerido para voice notes Telegram)."""
        import subprocess
        import tempfile
        import platform

        try:
            # Cria arquivos temporários
            with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as webm_file:
                webm_file.write(webm_bytes)
                webm_path = webm_file.name

            ogg_path = webm_path.replace(".webm", ".ogg")

            # Determina caminho do FFmpeg (Windows vs Linux)
            if platform.system() == "Windows":
                ffmpeg_path = os.environ.get("FFMPEG_PATH", r"C:\ffmpeg\bin\ffmpeg.exe")
            else:
                ffmpeg_path = "ffmpeg"

            # Converte com FFmpeg
            result = subprocess.run([
                ffmpeg_path, "-y",
                "-i", webm_path,
                "-c:a", "libopus",
                "-b:a", "64k",
                ogg_path
            ], capture_output=True, timeout=30)

            if result.returncode != 0:
                print(f"FFmpeg erro: {result.stderr.decode()}")
                return None

            # Lê resultado
            with open(ogg_path, "rb") as f:
                ogg_bytes = f.read()

            # Limpa arquivos temporários
            os.unlink(webm_path)
            os.unlink(ogg_path)

            return ogg_bytes

        except FileNotFoundError:
            print("FFmpeg não encontrado - enviando WebM diretamente")
            return None
        except Exception as e:
            print(f"Erro na conversão: {e}")
            return None

    async def _send_with_attachments(self, client, telegram_user_id: int, text: str, attachments: list, db):
        """Envia mensagem com attachments (incluindo áudios como voice notes)."""
        from supabase import create_client
        import io

        supabase_url = os.environ["SUPABASE_URL"]
        supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        storage_client = create_client(supabase_url, supabase_key)

        sent = None
        for i, att in enumerate(attachments):
            try:
                # Download do storage
                file_bytes = storage_client.storage.from_(
                    att["storage_bucket"]
                ).download(att["storage_path"])

                # Prepara caption (texto apenas no primeiro arquivo)
                caption = text if i == 0 and text.strip() else None

                mime_type = att.get("mime_type", "")
                file_name = att["file_name"]
                is_audio = mime_type.startswith("audio/") or mime_type == "application/ogg"
                is_image = mime_type.startswith("image/")

                # Se for WebM, converte para OGG (Telegram requer OGG Opus para voice notes)
                if is_audio and (mime_type == "audio/webm" or file_name.endswith(".webm")):
                    print(f"Convertendo {file_name} de WebM para OGG...")
                    ogg_bytes = self._convert_webm_to_ogg(file_bytes)
                    if ogg_bytes:
                        file_bytes = ogg_bytes
                        file_name = file_name.replace(".webm", ".ogg")
                        mime_type = "audio/ogg"
                        print(f"Conversão bem-sucedida: {file_name}")

                # Envia arquivo
                file_like = io.BytesIO(file_bytes)
                file_like.name = file_name

                if is_audio:
                    # Envia como voice note
                    sent = await client.send_file(
                        telegram_user_id,
                        file_like,
                        caption=caption,
                        voice_note=True,  # Envia como voice note
                    )
                    print(f"Áudio {file_name} enviado como voice note")
                elif is_image:
                    # Envia como foto
                    sent = await client.send_file(
                        telegram_user_id,
                        file_like,
                        caption=caption,
                        force_document=False,
                    )
                    print(f"Imagem {att['file_name']} enviada")
                else:
                    # Envia como documento
                    sent = await client.send_file(
                        telegram_user_id,
                        file_like,
                        caption=caption,
                        force_document=True,
                    )
                    print(f"Documento {att['file_name']} enviado")

            except Exception as e:
                print(f"Erro ao enviar attachment {att['id']}: {e}")

        # Se tinha texto mas não conseguiu enviar com mídia, envia só texto
        if not sent and text.strip():
            sent = await client.send_message(telegram_user_id, text)

        return sent

    def _mark_account_error(self, acc_id: str, error: str):
        """Marca erro na conta."""
        db = get_supabase()
        db.table("integration_accounts").update({
            "last_error": error,
        }).eq("id", acc_id).execute()

    async def _handle_incoming_message(self, acc_id: str, owner_id: str, event):
        """Processa mensagem recebida."""
        try:
            msg = event.message
            text = msg.text or ""
            has_media = msg.media is not None

            print(f"[DEBUG] Processando mensagem: {text[:50] if text else '(mídia)'}, has_media={has_media}")
            sender = await event.get_sender()
            print(f"[DEBUG] Sender: {sender}")
            if not isinstance(sender, User):
                print(f"[DEBUG] Sender não é User, ignorando")
                return  # Ignora mensagens de grupos/canais por enquanto

            db = get_supabase()
            client = self.clients[acc_id]

            # Busca ou cria contact_identity (com avatar se novo)
            telegram_user_id = str(sender.id)
            identity = await self._get_or_create_identity(
                db, owner_id, telegram_user_id, sender, client
            )

            # Busca ou cria conversa
            conversation = await self._get_or_create_conversation(
                db, owner_id, identity["id"], identity["contact_id"]
            )

            # Cria mensagem
            now = datetime.now(timezone.utc).isoformat()
            message_id = str(uuid4())

            db.table("messages").insert({
                "id": message_id,
                "owner_id": owner_id,
                "conversation_id": conversation["id"],
                "integration_account_id": acc_id,
                "identity_id": identity["id"],
                "channel": "telegram",
                "direction": "inbound",
                "text": text if text else None,
                "sent_at": msg.date.isoformat(),
                "external_message_id": str(msg.id),
                "raw_payload": {},
            }).execute()

            # Processa mídia se houver
            if has_media:
                await self._process_incoming_media(client, db, owner_id, message_id, msg)

            # Atualiza conversa e incrementa unread_count
            # Usa RPC para incrementar atomicamente
            db.rpc("increment_unread", {"conv_id": conversation["id"]}).execute()

            # Preview da mensagem (trunca em 100 chars)
            preview = (text[:100] + "...") if text and len(text) > 100 else (text or "[Mídia]")

            db.table("conversations").update({
                "last_message_at": now,
                "last_channel": "telegram",
                "last_message_preview": preview,
            }).eq("id", conversation["id"]).execute()

            display_text = text[:50] if text else "(mídia)"
            print(f"Mensagem recebida de {sender.first_name}: {display_text}...")

        except Exception as e:
            import traceback
            print(f"Erro ao processar mensagem: {e}")
            traceback.print_exc()

    async def _handle_outgoing_message(self, acc_id: str, owner_id: str, event):
        """Processa mensagem enviada pelo próprio usuário (em outros apps)."""
        try:
            msg = event.message
            text = msg.text or ""
            has_media = msg.media is not None

            # Ignora se for mensagem de grupo/canal
            if not event.is_private:
                return

            # Verifica se já foi processada pela ferramenta (tem external_message_id real)
            db = get_supabase()
            existing = db.table("messages").select("id").eq(
                "external_message_id", str(msg.id)
            ).execute()

            if existing.data:
                print(f"[DEBUG] Mensagem outgoing {msg.id} já existe, ignorando")
                return

            client = self.clients[acc_id]

            # O destinatário é o chat
            chat = await event.get_chat()
            if not isinstance(chat, User):
                return

            # Busca ou cria identity para o destinatário (com avatar se novo)
            telegram_user_id = str(chat.id)
            identity = await self._get_or_create_identity(
                db, owner_id, telegram_user_id, chat, client
            )

            # Busca ou cria conversa
            conversation = await self._get_or_create_conversation(
                db, owner_id, identity["id"], identity["contact_id"]
            )

            # Cria mensagem como outbound
            now = datetime.now(timezone.utc).isoformat()
            message_id = str(uuid4())

            db.table("messages").insert({
                "id": message_id,
                "owner_id": owner_id,
                "conversation_id": conversation["id"],
                "integration_account_id": acc_id,
                "identity_id": identity["id"],
                "channel": "telegram",
                "direction": "outbound",
                "text": text if text else None,
                "sent_at": msg.date.isoformat(),
                "external_message_id": str(msg.id),
                "raw_payload": {},
            }).execute()

            # Processa mídia se houver
            if has_media:
                await self._process_incoming_media(client, db, owner_id, message_id, msg)

            # Atualiza conversa (sem incrementar unread - é outbound)
            # Também atualiza preview para mostrar última mensagem enviada
            preview = (text[:100] + "...") if text and len(text) > 100 else (text or "[Mídia]")
            db.table("conversations").update({
                "last_message_at": now,
                "last_channel": "telegram",
                "last_message_preview": preview,
            }).eq("id", conversation["id"]).execute()

            display_text = text[:50] if text else "(mídia)"
            print(f"Mensagem enviada para {chat.first_name}: {display_text}...")

        except Exception as e:
            import traceback
            print(f"Erro ao processar mensagem outgoing: {e}")
            traceback.print_exc()

    async def _handle_chat_action(self, acc_id: str, owner_id: str, event):
        """Processa ações de chat (entrada/saída de membros, etc)."""
        try:
            db = get_supabase()
            client = self.clients[acc_id]

            # Pega o chat (grupo)
            chat = await event.get_chat()
            chat_id = str(event.chat_id)

            # Determina o tipo de ação e texto
            action_text = None
            message_type = None

            if event.user_joined:
                user = await event.get_user()
                if user:
                    name = user.first_name or user.username or "Alguém"
                    action_text = f"{name} joined the group via invite link"
                    message_type = "service_join"
            elif event.user_left:
                user = await event.get_user()
                if user:
                    name = user.first_name or user.username or "Alguém"
                    action_text = f"{name} left the group"
                    message_type = "service_leave"
            elif event.user_kicked:
                user = await event.get_user()
                if user:
                    name = user.first_name or user.username or "Alguém"
                    action_text = f"{name} was removed from the group"
                    message_type = "service_kick"
            elif event.user_added:
                users = await event.get_users()
                if users:
                    names = [u.first_name or u.username or "?" for u in users]
                    action_text = f"{', '.join(names)} was added to the group"
                    message_type = "service_add"

            if not action_text or not message_type:
                print(f"[DEBUG] Chat action ignorada (tipo não suportado)")
                return

            # Busca ou cria identity para o grupo
            identity = await self._get_or_create_group_identity(
                db, owner_id, chat_id, chat, client
            )

            # Busca ou cria conversa
            conversation = await self._get_or_create_conversation(
                db, owner_id, identity["id"], identity["contact_id"]
            )

            # Cria mensagem de serviço
            now = datetime.now(timezone.utc).isoformat()
            message_id = str(uuid4())

            db.table("messages").insert({
                "id": message_id,
                "owner_id": owner_id,
                "conversation_id": conversation["id"],
                "integration_account_id": acc_id,
                "identity_id": identity["id"],
                "channel": "telegram",
                "direction": "inbound",
                "text": action_text,
                "message_type": message_type,
                "sent_at": now,
                "external_message_id": f"action-{message_id}",
                "raw_payload": {},
            }).execute()

            # Atualiza conversa
            db.table("conversations").update({
                "last_message_at": now,
                "last_channel": "telegram",
            }).eq("id", conversation["id"]).execute()

            print(f"[SERVICE] {action_text}")

        except Exception as e:
            import traceback
            print(f"Erro ao processar chat action: {e}")
            traceback.print_exc()

    async def _parse_service_message(self, client, msg: MessageService) -> tuple[str | None, str | None, dict | None]:
        """Parse MessageService e retorna (texto, message_type, metadata) ou (None, None, None)."""
        action = msg.action

        # Tenta pegar info do usuário que fez a ação
        user_id = None
        user_name = None
        if msg.from_id and hasattr(msg.from_id, 'user_id'):
            user_id = msg.from_id.user_id
            try:
                user = await client.get_entity(user_id)
                user_name = getattr(user, 'first_name', None) or getattr(user, 'username', None) or str(user_id)
            except Exception:
                user_name = str(user_id)

        if isinstance(action, MessageActionChatJoinedByLink):
            name = user_name or "Alguém"
            metadata = {"action_user_id": user_id, "action_user_name": user_name} if user_id else {}
            return f"{name} joined the group via invite link", "service_join", metadata

        elif isinstance(action, MessageActionChatJoinedByRequest):
            name = user_name or "Alguém"
            metadata = {"action_user_id": user_id, "action_user_name": user_name} if user_id else {}
            return f"{name} joined the group via request", "service_join", metadata

        elif isinstance(action, MessageActionChatAddUser):
            user_ids = action.users if action.users else []
            count = len(user_ids)
            if count == 1:
                added_id = user_ids[0]
                try:
                    added_user = await client.get_entity(added_id)
                    added_name = getattr(added_user, 'first_name', None) or str(added_id)
                except Exception:
                    added_name = str(added_id)
                metadata = {"action_user_id": added_id, "action_user_name": added_name}
                return f"{added_name} was added to the group", "service_add", metadata
            elif count > 1:
                return f"{count} members were added to the group", "service_add", {"action_user_ids": user_ids}
            return None, None, None

        elif isinstance(action, MessageActionChatDeleteUser):
            removed_id = action.user_id
            try:
                removed_user = await client.get_entity(removed_id)
                removed_name = getattr(removed_user, 'first_name', None) or str(removed_id)
            except Exception:
                removed_name = str(removed_id)

            metadata = {"action_user_id": removed_id, "action_user_name": removed_name}

            # Se o user_id == from_id, ele saiu. Senão, foi removido
            if msg.from_id and hasattr(msg.from_id, 'user_id'):
                if action.user_id == msg.from_id.user_id:
                    return f"{removed_name} left the group", "service_leave", metadata
            return f"{removed_name} was removed from the group", "service_kick", metadata

        # Ação não suportada
        return None, None, None

    async def _get_or_create_group_identity(self, db, owner_id: str, chat_id: str, chat, client):
        """Busca ou cria identity para um grupo do Telegram."""
        # Verifica se já existe (usa telegram_user com is_group no metadata)
        existing = db.table("contact_identities").select(
            "id, contact_id"
        ).eq("type", "telegram_user").eq("value", chat_id).eq("owner_id", owner_id).execute()

        if existing.data:
            return existing.data[0]

        # Pega título do grupo
        title = getattr(chat, 'title', None) or f"Grupo {chat_id}"

        # Cria contato para o grupo
        contact_id = str(uuid4())
        db.table("contacts").insert({
            "id": contact_id,
            "owner_id": owner_id,
            "display_name": title,
            "metadata": {"is_group": True},
        }).execute()

        # Cria identity (sempre telegram_user, is_group no metadata)
        identity_id = str(uuid4())
        db.table("contact_identities").insert({
            "id": identity_id,
            "owner_id": owner_id,
            "contact_id": contact_id,
            "type": "telegram_user",
            "value": chat_id,
            "metadata": {
                "display_name": title,
                "title": title,
                "is_group": True,
            },
        }).execute()

        return {"id": identity_id, "contact_id": contact_id}

    async def _process_incoming_media(self, client, db, owner_id: str, message_id: str, msg):
        """Baixa e salva mídia de mensagem recebida."""
        try:
            from telethon.tl.types import DocumentAttributeAudio, DocumentAttributeFilename

            # Baixa mídia para bytes
            media_bytes = await client.download_media(msg, file=bytes)
            if not media_bytes:
                return

            # Determina nome e tipo do arquivo
            file_name = "media"
            mime_type = "application/octet-stream"
            is_voice = False

            if hasattr(msg.media, "photo"):
                file_name = f"photo_{msg.id}.jpg"
                mime_type = "image/jpeg"
            elif hasattr(msg.media, "document"):
                doc = msg.media.document
                mime_type = doc.mime_type or "application/octet-stream"

                # Verifica se é voice note ou áudio
                for attr in doc.attributes:
                    if isinstance(attr, DocumentAttributeAudio):
                        is_voice = getattr(attr, "voice", False)
                        if is_voice:
                            # Voice note - geralmente .ogg
                            file_name = f"voice_{msg.id}.ogg"
                            mime_type = "audio/ogg"
                        else:
                            # Áudio normal
                            duration = getattr(attr, "duration", 0)
                            title = getattr(attr, "title", None)
                            if title:
                                file_name = f"{title}.ogg"
                            else:
                                ext = mime_type.split("/")[-1] if "/" in mime_type else "ogg"
                                file_name = f"audio_{msg.id}.{ext}"
                        break
                    elif isinstance(attr, DocumentAttributeFilename):
                        file_name = attr.file_name
                else:
                    # Não encontrou atributos específicos
                    ext = mime_type.split("/")[-1] if "/" in mime_type else "bin"
                    file_name = f"file_{msg.id}.{ext}"

            # Upload para Supabase Storage
            storage_path = f"telegram/{owner_id}/{message_id}/{file_name}"

            # Usa service role para upload
            from supabase import create_client
            supabase_url = os.environ["SUPABASE_URL"]
            supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
            storage_client = create_client(supabase_url, supabase_key)

            storage_client.storage.from_("attachments").upload(
                storage_path,
                media_bytes,
                {"content-type": mime_type}
            )

            # Salva attachment no banco
            attachment_id = str(uuid4())
            db.table("attachments").insert({
                "id": attachment_id,
                "owner_id": owner_id,
                "message_id": message_id,
                "storage_bucket": "attachments",
                "storage_path": storage_path,
                "file_name": file_name,
                "mime_type": mime_type,
                "byte_size": len(media_bytes),
            }).execute()

            print(f"Mídia salva: {file_name} ({len(media_bytes)} bytes)")

        except Exception as e:
            print(f"Erro ao processar mídia: {e}")

    async def _download_and_store_avatar(self, client: TelegramClient, owner_id: str, entity) -> str | None:
        """Baixa foto de perfil do Telegram e salva no Supabase Storage."""
        try:
            photo_bytes = await client.download_profile_photo(entity, file=bytes)
            if not photo_bytes:
                return None

            supabase_url = os.environ["SUPABASE_URL"]
            supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
            storage_client = create_supabase_client(supabase_url, supabase_key)

            telegram_id = entity.id
            storage_path = f"telegram/{owner_id}/telegram_{telegram_id}.jpg"

            # Remove foto antiga se existir
            try:
                storage_client.storage.from_("avatars").remove([storage_path])
            except Exception:
                pass

            # Upload nova foto
            storage_client.storage.from_("avatars").upload(
                storage_path,
                photo_bytes,
                {"content-type": "image/jpeg"}
            )

            return f"{supabase_url}/storage/v1/object/public/avatars/{storage_path}"

        except Exception as e:
            print(f"[AVATAR] Erro ao baixar avatar para {entity.id}: {e}")
            return None

    async def _get_or_create_identity(self, db, owner_id: str, telegram_user_id: str, sender: User, client: TelegramClient = None) -> dict:
        """Busca ou cria identity para o usuário Telegram (com avatar para novos)."""
        # Busca identity existente
        result = db.table("contact_identities").select(
            "id, contact_id"
        ).eq("owner_id", owner_id).eq(
            "type", "telegram_user"
        ).eq("value", telegram_user_id).execute()

        if result.data:
            return result.data[0]

        # Baixa avatar apenas para identity NOVA
        avatar_url = None
        if client:
            avatar_url = await self._download_and_store_avatar(client, owner_id, sender)

        # Cria apenas identity (sem contato - PRD 5.4)
        identity_id = str(uuid4())
        db.table("contact_identities").insert({
            "id": identity_id,
            "owner_id": owner_id,
            "contact_id": None,
            "type": "telegram_user",
            "value": telegram_user_id,
            "metadata": {
                "first_name": sender.first_name,
                "last_name": sender.last_name,
                "username": sender.username,
                "avatar_url": avatar_url,
            },
        }).execute()

        return {"id": identity_id, "contact_id": None}

    async def _get_or_create_conversation(self, db, owner_id: str, identity_id: str, contact_id: str | None) -> dict:
        """Busca ou cria conversa. Se contact_id existe, busca por contato. Senão, busca por identity."""
        # Se tem contact_id, busca conversa do contato
        if contact_id:
            result = db.table("conversations").select(
                "id"
            ).eq("owner_id", owner_id).eq("contact_id", contact_id).execute()
            if result.data:
                return result.data[0]

        # Busca conversa não vinculada pela identity
        result = db.table("conversations").select(
            "id"
        ).eq("owner_id", owner_id).eq("primary_identity_id", identity_id).is_("contact_id", "null").execute()

        if result.data:
            return result.data[0]

        # Cria conversa não vinculada (apenas com identity)
        conv_id = str(uuid4())
        db.table("conversations").insert({
            "id": conv_id,
            "owner_id": owner_id,
            "contact_id": contact_id,  # None para não vinculadas
            "primary_identity_id": identity_id,
            "status": "open",
            "last_channel": "telegram",
            "last_message_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        return {"id": conv_id}

    async def _history_sync_loop(self):
        """Loop para processar jobs de sincronização de histórico."""
        # Aguarda 10s para contas conectarem antes de processar syncs
        await asyncio.sleep(10)
        print("[SYNC] Loop de sync iniciado")

        while True:
            try:
                # Só processa se tiver pelo menos 1 conta conectada
                if not self.clients:
                    await asyncio.sleep(5)
                    continue

                await self._process_history_sync_jobs()
                await asyncio.sleep(5)  # Delay maior entre ciclos (era 2s)
            except Exception as e:
                print(f"Erro no history sync loop: {e}")
                await asyncio.sleep(10)

    async def _process_history_sync_jobs(self):
        """Processa jobs de sincronização de histórico pendentes."""
        db = get_supabase()

        # Busca apenas 1 job por vez para não sobrecarregar (era 5)
        result = db.table("sync_history_jobs").select(
            "id, owner_id, conversation_id, integration_account_id, limit_messages, "
            "telegram_id, telegram_name, workspace_id, is_group"
        ).eq("status", "pending").order("created_at").limit(1).execute()

        for job in result.data:
            await self._process_single_history_job(db, job)
            # Delay após cada sync para não sobrecarregar
            await asyncio.sleep(2)

    async def _resolve_telegram_entity(self, client, telegram_id: int):
        """Resolve entidade do Telegram (usuário ou grupo)."""
        entity = None

        # Método 1: get_entity direto (usa cache interno do Telethon)
        try:
            entity = await client.get_entity(telegram_id)
            if entity:
                print(f"[SYNC] Entidade {telegram_id} encontrada via get_entity")
                return entity
        except (ValueError, Exception) as e:
            print(f"[SYNC] get_entity falhou para {telegram_id}: {e}")

        # Método 2: get_input_entity (funciona com IDs conhecidos)
        try:
            from telethon.tl.types import InputPeerUser, InputPeerChat, InputPeerChannel
            input_entity = await client.get_input_entity(telegram_id)
            if input_entity:
                # Converte input entity para entity completa
                entity = await client.get_entity(input_entity)
                if entity:
                    print(f"[SYNC] Entidade {telegram_id} encontrada via get_input_entity")
                    return entity
        except (ValueError, Exception) as e:
            print(f"[SYNC] get_input_entity falhou para {telegram_id}: {e}")

        # Método 3: Busca nos diálogos (mais lento)
        print(f"[SYNC] Carregando diálogos para encontrar {telegram_id}...")
        try:
            async for dialog in client.iter_dialogs(limit=None):
                if dialog.entity and hasattr(dialog.entity, 'id') and dialog.entity.id == telegram_id:
                    entity = dialog.entity
                    print(f"[SYNC] Encontrado nos diálogos: {entity.id}")
                    return entity
        except Exception as e:
            print(f"[SYNC] iter_dialogs falhou: {e}")

        print(f"[SYNC] Entidade {telegram_id} não encontrada em nenhum método")
        return None

    async def _get_or_create_sync_identity(self, db, owner_id: str, telegram_id: int, entity, is_group: bool, client):
        """Busca ou cria identity para sync (função unificada)."""
        telegram_id_str = str(telegram_id)
        # Sempre usa telegram_user, distingue por metadata.is_group
        identity_type = "telegram_user"

        # Busca existente
        existing = db.table("contact_identities").select(
            "id, metadata, type"
        ).eq("owner_id", owner_id).eq("value", telegram_id_str).eq(
            "type", "telegram_user"
        ).execute()

        if existing.data:
            identity = existing.data[0]
            metadata = identity.get("metadata") or {}

            # Atualiza is_group se necessário
            if is_group and not metadata.get("is_group"):
                metadata["is_group"] = True
                db.table("contact_identities").update({
                    "metadata": metadata
                }).eq("id", identity["id"]).execute()

            return identity["id"], metadata

        # Cria nova identity
        metadata = {"is_group": is_group}

        if is_group:
            metadata["title"] = getattr(entity, 'title', None) or f"Grupo {telegram_id}"
            metadata["username"] = getattr(entity, 'username', None)
        else:
            metadata["first_name"] = getattr(entity, 'first_name', None)
            metadata["last_name"] = getattr(entity, 'last_name', None)
            metadata["username"] = getattr(entity, 'username', None)

        # Baixa avatar
        avatar_url = await self._download_and_store_avatar(client, owner_id, entity)
        if avatar_url:
            metadata["avatar_url"] = avatar_url

        identity_id = str(uuid4())
        db.table("contact_identities").insert({
            "id": identity_id,
            "owner_id": owner_id,
            "contact_id": None,
            "type": identity_type,
            "value": telegram_id_str,
            "metadata": metadata,
        }).execute()

        print(f"[SYNC] Identity criada: {identity_id}")
        return identity_id, metadata

    async def _get_or_create_sync_conversation(self, db, owner_id: str, identity_id: str, workspace_id: str) -> str:
        """Busca ou cria conversa para sync (função unificada)."""
        # Busca existente
        existing = db.table("conversations").select(
            "id"
        ).eq("owner_id", owner_id).eq("primary_identity_id", identity_id).execute()

        if existing.data:
            return existing.data[0]["id"]

        # Cria nova conversa
        conv_id = str(uuid4())
        db.table("conversations").insert({
            "id": conv_id,
            "owner_id": owner_id,
            "workspace_id": workspace_id,
            "contact_id": None,
            "primary_identity_id": identity_id,
            "status": "open",
            "last_channel": "telegram",
            "last_message_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        print(f"[SYNC] Conversa criada: {conv_id}")
        return conv_id

    async def _process_single_history_job(self, db, job: dict):
        """Processa um job de sincronização de histórico (formato unificado)."""
        job_id = job["id"]
        owner_id = job["owner_id"]
        acc_id = job["integration_account_id"]
        limit = job.get("limit_messages", 100)

        # Novo formato: telegram_id | Antigo formato: conversation_id
        telegram_id = job.get("telegram_id")
        workspace_id = job.get("workspace_id")
        is_group = job.get("is_group", False)
        telegram_name = job.get("telegram_name")
        conversation_id = job.get("conversation_id")

        print(f"[SYNC] Processando job {job_id}")

        # Marca como processing
        db.table("sync_history_jobs").update({
            "status": "processing",
        }).eq("id", job_id).execute()

        try:
            # Verifica se temos cliente conectado para esta conta
            if acc_id not in self.clients:
                raise Exception(f"Conta {acc_id} não conectada")

            client = self.clients[acc_id]

            # NOVO FORMATO: telegram_id (worker cria identity/conversa)
            if telegram_id:
                telegram_user_id = int(telegram_id)

                # Resolve entidade
                entity = await self._resolve_telegram_entity(client, telegram_user_id)
                if not entity:
                    raise Exception(f"Entidade {telegram_user_id} não encontrada")

                # Verifica se é grupo pela entidade real
                is_group = isinstance(entity, (Chat, Channel))

                # Cria ou busca identity
                identity_id, identity_metadata = await self._get_or_create_sync_identity(
                    db, owner_id, telegram_user_id, entity, is_group, client
                )

                # Cria ou busca conversa
                conversation_id = await self._get_or_create_sync_conversation(
                    db, owner_id, identity_id, workspace_id
                )

                # Atualiza job com conversation_id
                db.table("sync_history_jobs").update({
                    "conversation_id": conversation_id
                }).eq("id", job_id).execute()

            # ANTIGO FORMATO: conversation_id (compatibilidade)
            else:
                if not conversation_id:
                    raise Exception("Job sem telegram_id nem conversation_id")

                # Busca identity da conversa
                conv_result = db.table("conversations").select(
                    "primary_identity_id"
                ).eq("id", conversation_id).single().execute()

                if not conv_result.data:
                    raise Exception("Conversa não encontrada")

                identity_id = conv_result.data["primary_identity_id"]

                # Busca telegram_user_id
                identity_result = db.table("contact_identities").select(
                    "value, metadata"
                ).eq("id", identity_id).single().execute()

                if not identity_result.data:
                    raise Exception("Identity não encontrada")

                telegram_user_id = int(identity_result.data["value"])
                identity_metadata = identity_result.data.get("metadata") or {}
                is_group = identity_metadata.get("is_group", False)

                # Resolve entidade
                entity = await self._resolve_telegram_entity(client, telegram_user_id)
                if not entity:
                    raise Exception(f"Entidade {telegram_user_id} não encontrada")

                # Atualiza is_group se detectou grupo
                if isinstance(entity, (Chat, Channel)) and not is_group:
                    print(f"[SYNC] Detectado grupo, atualizando metadata...")
                    identity_metadata["is_group"] = True
                    is_group = True
                    db.table("contact_identities").update({
                        "metadata": identity_metadata
                    }).eq("id", identity_id).execute()

            # Busca mensagens existentes para evitar duplicatas
            existing_result = db.table("messages").select(
                "external_message_id"
            ).eq("conversation_id", conversation_id).execute()

            existing_msg_ids = {m["external_message_id"] for m in existing_result.data}

            # Busca histórico do Telegram (limite de 3 meses)
            messages_synced = 0
            skipped_old = 0
            skipped_exists = 0
            skipped_no_content = 0
            total_fetched = 0
            three_months_ago = datetime.now(timezone.utc) - timedelta(days=90)

            print(f"[SYNC] Buscando mensagens para entity {entity.id}, limit={limit}, is_group={is_group}")
            print(f"[SYNC] Cutoff date: {three_months_ago}, existing_ids count: {len(existing_msg_ids)}")

            # NOTA: Não usar offset_date com reverse=True - bug conhecido do Telethon para grupos
            # Filtramos manualmente por data após receber as mensagens
            async for msg in client.iter_messages(entity, limit=limit):
                total_fetched += 1

                # Pula mensagens mais antigas que 3 meses
                if msg.date.replace(tzinfo=timezone.utc) < three_months_ago:
                    skipped_old += 1
                    continue

                # Pula se já existe
                if str(msg.id) in existing_msg_ids:
                    skipped_exists += 1
                    continue

                # Verifica se é mensagem de serviço (join/leave) - só para grupos
                if is_group and isinstance(msg, MessageService):
                    service_text, message_type, service_metadata = await self._parse_service_message(client, msg)
                    if service_text and message_type:
                        message_id = str(uuid4())
                        db.table("messages").insert({
                            "id": message_id,
                            "owner_id": owner_id,
                            "conversation_id": conversation_id,
                            "integration_account_id": acc_id,
                            "identity_id": identity_id,
                            "channel": "telegram",
                            "direction": "inbound",
                            "text": service_text,
                            "message_type": message_type,
                            "sent_at": msg.date.isoformat(),
                            "external_message_id": str(msg.id),
                            "raw_payload": service_metadata or {},
                        }).execute()
                        messages_synced += 1
                    continue

                # Só processa mensagens com texto ou mídia
                if not msg.text and not msg.media:
                    skipped_no_content += 1
                    continue

                # Determina direção
                direction = "outbound" if msg.out else "inbound"

                # Cria mensagem
                message_id = str(uuid4())
                text = msg.text or ""
                has_media = msg.media is not None

                db.table("messages").insert({
                    "id": message_id,
                    "owner_id": owner_id,
                    "conversation_id": conversation_id,
                    "integration_account_id": acc_id,
                    "identity_id": identity_id,
                    "channel": "telegram",
                    "direction": direction,
                    "text": text if text else None,
                    "sent_at": msg.date.isoformat(),
                    "external_message_id": str(msg.id),
                    "raw_payload": {},
                }).execute()

                # Processa mídia se houver
                if has_media:
                    await self._process_incoming_media(client, db, owner_id, message_id, msg)

                messages_synced += 1

            print(f"[SYNC] Resumo: fetched={total_fetched}, old={skipped_old}, exists={skipped_exists}, no_content={skipped_no_content}, synced={messages_synced}")

            # Busca a última mensagem REAL da conversa (pode ser nova ou existente)
            last_msg_result = db.table("messages").select(
                "sent_at, text, message_type"
            ).eq("conversation_id", conversation_id).order(
                "sent_at", desc=True
            ).limit(1).execute()

            if last_msg_result.data:
                last_msg = last_msg_result.data[0]
                preview = last_msg.get("text") or ""
                if last_msg.get("message_type", "").startswith("service_"):
                    preview = last_msg.get("text") or "Ação no grupo"
                elif not preview:
                    preview = "📎 Mídia"
                else:
                    preview = (preview[:100] + "...") if len(preview) > 100 else preview

                db.table("conversations").update({
                    "last_message_at": last_msg["sent_at"],
                    "last_message_preview": preview,
                }).eq("id", conversation_id).execute()

            # Marca como completed
            db.table("sync_history_jobs").update({
                "status": "completed",
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "messages_synced": messages_synced,
            }).eq("id", job_id).execute()

            print(f"[SYNC] Job {job_id} concluído: {messages_synced} mensagens sincronizadas")

        except Exception as e:
            import traceback
            print(f"[SYNC] Erro no job {job_id}: {e}")
            traceback.print_exc()

            # Marca como failed
            db.table("sync_history_jobs").update({
                "status": "failed",
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "error_message": str(e),
            }).eq("id", job_id).execute()

    async def _handle_message_read(self, acc_id: str, owner_id: str, event):
        """Processa evento de leitura de mensagem (read receipts)."""
        try:
            # event.outbox = True quando NOSSA mensagem foi lida pelo outro
            # event.outbox = False quando NÓS lemos mensagem deles
            if not event.outbox:
                return  # Só nos interessa quando nossas msgs são lidas

            db = get_supabase()

            # Pega o ID do chat/usuário que leu
            chat_id = event.chat_id
            max_id = event.max_id  # Todas as mensagens até esse ID foram lidas

            # Busca mensagens outbound que foram lidas
            result = db.table("messages").select(
                "id, external_message_id"
            ).eq("owner_id", owner_id).lte(
                "external_message_id", str(max_id)
            ).eq("direction", "outbound").eq(
                "channel", "telegram"
            ).execute()

            now = datetime.now(timezone.utc).isoformat()

            for msg in result.data:
                # Verifica se já tem evento de read
                existing = db.table("message_events").select("id").eq(
                    "message_id", msg["id"]
                ).eq("type", "read").execute()

                if not existing.data:
                    # Insere evento de leitura
                    db.table("message_events").insert({
                        "owner_id": owner_id,
                        "message_id": msg["id"],
                        "type": "read",
                        "occurred_at": now,
                        "payload": {"read_by_chat_id": chat_id},
                    }).execute()

            print(f"[READ] Mensagens até {max_id} marcadas como lidas")

        except Exception as e:
            print(f"[READ] Erro ao processar evento de leitura: {e}")

    async def _handle_user_update(self, acc_id: str, owner_id: str, event):
        """Processa eventos de atualização do usuário (typing, online)."""
        try:
            db = get_supabase()
            user_id = event.user_id
            now = datetime.now(timezone.utc)

            # Busca identity do usuário
            identity_result = db.table("contact_identities").select(
                "id"
            ).eq("owner_id", owner_id).eq(
                "type", "telegram_user"
            ).eq("value", str(user_id)).execute()

            if not identity_result.data:
                return  # Usuário não está em nossos contatos

            identity_id = identity_result.data[0]["id"]

            # Busca conversa do usuário
            conv_result = db.table("conversations").select("id").eq(
                "primary_identity_id", identity_id
            ).execute()

            conversation_id = conv_result.data[0]["id"] if conv_result.data else None

            # Verifica se é evento de typing
            is_typing = False
            is_online = None
            last_seen = None

            if hasattr(event, 'typing') and event.typing:
                is_typing = True
                typing_expires = (now + timedelta(seconds=5)).isoformat()
            else:
                typing_expires = None

            # Verifica status online
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
                    last_seen = now.isoformat()  # Aproximado

            # Upsert em presence_status
            db.table("presence_status").upsert({
                "owner_id": owner_id,
                "contact_identity_id": identity_id,
                "conversation_id": conversation_id,
                "is_typing": is_typing,
                "is_online": is_online if is_online is not None else False,
                "last_seen_at": last_seen,
                "typing_expires_at": typing_expires,
                "updated_at": now.isoformat(),
            }, on_conflict="owner_id,contact_identity_id").execute()

            if is_typing:
                print(f"[PRESENCE] Usuário {user_id} está digitando")
            elif is_online is not None:
                status_str = "online" if is_online else "offline"
                print(f"[PRESENCE] Usuário {user_id} está {status_str}")

        except Exception as e:
            print(f"[PRESENCE] Erro ao processar evento: {e}")


    async def _message_jobs_loop(self):
        """Loop para processar jobs de edição/deleção de mensagens."""
        # Aguarda 5s para contas conectarem
        await asyncio.sleep(5)

        while True:
            try:
                # Só processa se tiver conta conectada
                if not self.clients:
                    await asyncio.sleep(2)
                    continue

                await self._process_message_jobs()
                await asyncio.sleep(2)  # Verifica a cada 2s
            except Exception as e:
                print(f"Erro no message jobs loop: {e}")
                await asyncio.sleep(5)

    async def _process_message_jobs(self):
        """Processa jobs de edit/delete pendentes."""
        db = get_supabase()

        # Busca jobs pendentes
        result = db.table("message_jobs").select(
            "id, owner_id, message_id, integration_account_id, action, payload, status"
        ).eq("status", "pending").order("created_at").limit(10).execute()

        for job in result.data:
            await self._process_single_message_job(db, job)

    async def _process_single_message_job(self, db, job: dict):
        """Processa um job de edit ou delete."""
        job_id = job["id"]
        action = job["action"]
        acc_id = job.get("integration_account_id")
        payload = job.get("payload", {})

        print(f"[JOB] Processando {action} job {job_id}")

        # Marca como processing
        db.table("message_jobs").update({
            "status": "processing",
        }).eq("id", job_id).execute()

        try:
            # Verifica se temos cliente conectado
            if not acc_id or acc_id not in self.clients:
                raise Exception(f"Conta {acc_id} não conectada")

            client = self.clients[acc_id]
            channel = payload.get("channel", "telegram")

            # Só processa Telegram por enquanto
            if channel != "telegram":
                raise Exception(f"Canal {channel} não suportado para {action}")

            # Ação especial: typing (não precisa de message_id)
            if action == "typing":
                telegram_user_id = payload.get("telegram_user_id")
                if not telegram_user_id:
                    raise Exception("telegram_user_id não encontrado no payload")

                # Envia ação de digitando para o Telegram
                await client.action(int(telegram_user_id), 'typing')
                print(f"[JOB] Typing enviado para {telegram_user_id}")

                # Marca como completed
                db.table("message_jobs").update({
                    "status": "completed",
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", job_id).execute()

                return  # Job concluído, sai da função

            external_msg_id = payload.get("external_message_id")
            if not external_msg_id or external_msg_id.startswith("local-") or external_msg_id.startswith("error-"):
                raise Exception(f"Mensagem não tem ID externo válido: {external_msg_id}")

            msg_id = int(external_msg_id)

            # Busca a conversa para pegar o chat_id
            message_result = db.table("messages").select(
                "conversation_id, identity_id"
            ).eq("id", job["message_id"]).single().execute()

            if not message_result.data:
                raise Exception("Mensagem não encontrada")

            identity_id = message_result.data["identity_id"]

            # Busca telegram_user_id da identity
            identity_result = db.table("contact_identities").select(
                "value"
            ).eq("id", identity_id).single().execute()

            if not identity_result.data:
                raise Exception("Identity não encontrada")

            telegram_user_id = int(identity_result.data["value"])

            if action == "edit":
                new_text = payload.get("new_text", "")
                if not new_text:
                    raise Exception("Texto vazio para edição")

                # Edita mensagem no Telegram
                await client.edit_message(telegram_user_id, msg_id, new_text)
                print(f"[JOB] Mensagem {msg_id} editada no Telegram")

            elif action == "delete":
                # Deleta mensagem no Telegram
                await client.delete_messages(telegram_user_id, [msg_id])
                print(f"[JOB] Mensagem {msg_id} deletada no Telegram")

            else:
                raise Exception(f"Ação desconhecida: {action}")

            # Marca como completed
            db.table("message_jobs").update({
                "status": "completed",
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", job_id).execute()

        except Exception as e:
            import traceback
            print(f"[JOB] Erro no job {job_id}: {e}")
            traceback.print_exc()

            # Marca como failed
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
