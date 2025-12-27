"""
Worker Email - Recebe e envia emails via IMAP/SMTP

Uso:
    python worker.py

Env vars necessárias:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    ENCRYPTION_KEY
"""

import asyncio
import email
import os
import re
import smtplib
import sys
from datetime import datetime, timezone
from email import policy
from email.header import decode_header
from email.message import EmailMessage
from email.utils import make_msgid, formatdate, parseaddr
from uuid import UUID, uuid4

from dotenv import load_dotenv
from imapclient import IMAPClient

# Adiciona shared ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.db import get_supabase
from shared.crypto import decrypt
from shared.heartbeat import Heartbeat

load_dotenv()


class EmailWorker:
    def __init__(self):
        self.clients: dict[str, IMAPClient] = {}
        self.heartbeats: dict[str, Heartbeat] = {}
        self.account_info: dict[str, dict] = {}  # acc_id -> {owner_id, config, ...}
        self.running = True

    async def start(self):
        print("Email Worker iniciando...")

        # Inicia loops em paralelo
        await asyncio.gather(
            self._sync_loop(),
            self._idle_loop(),
            self._outbound_loop(),
        )

    async def _sync_loop(self):
        """Loop de sincronizacao de contas."""
        while self.running:
            try:
                await self._sync_accounts()
                await asyncio.sleep(60)
            except Exception as e:
                print(f"Erro no sync loop: {e}")
                await asyncio.sleep(10)

    async def _idle_loop(self):
        """Loop de IMAP IDLE para receber emails."""
        while self.running:
            try:
                await self._check_all_accounts()
                await asyncio.sleep(30)  # Poll a cada 30s como fallback
            except Exception as e:
                print(f"Erro no idle loop: {e}")
                await asyncio.sleep(10)

    async def _outbound_loop(self):
        """Loop de envio de emails outbound."""
        while self.running:
            try:
                await self._process_outbound_messages()
                await asyncio.sleep(5)
            except Exception as e:
                print(f"Erro no outbound loop: {e}")
                await asyncio.sleep(5)

    async def _sync_accounts(self):
        """Sincroniza contas ativas do banco."""
        db = get_supabase()

        result = db.table("integration_accounts").select(
            "id, owner_id, secrets_encrypted, config"
        ).eq("type", "email_imap_smtp").eq("is_active", True).execute()

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
        """Conecta uma conta Email."""
        acc_id = account["id"]
        owner_id = account["owner_id"]

        try:
            # Descriptografa senha
            password = decrypt(account["secrets_encrypted"])
            config = account.get("config", {})

            imap_host = config.get("imap_host", "imap.gmail.com")
            imap_port = config.get("imap_port", 993)
            email_address = config.get("email")

            if not email_address:
                print(f"Conta {acc_id} sem email configurado")
                return

            # Conecta IMAP
            client = IMAPClient(imap_host, port=imap_port, ssl=True)
            client.login(email_address, password)
            client.select_folder("INBOX")

            # Inicia heartbeat
            hb = Heartbeat(
                owner_id=UUID(owner_id),
                integration_account_id=UUID(acc_id),
                worker_type="email",
            )
            await hb.start()

            self.clients[acc_id] = client
            self.heartbeats[acc_id] = hb
            self.account_info[acc_id] = {
                "owner_id": owner_id,
                "config": config,
                "password": password,
                "connected_at": datetime.now(timezone.utc),  # Para filtrar emails novos
            }

            print(f"Conta email {acc_id} ({email_address}) conectada")

            # Atualiza last_sync_at
            db = get_supabase()
            db.table("integration_accounts").update({
                "last_sync_at": datetime.now(timezone.utc).isoformat(),
                "last_error": None,
            }).eq("id", acc_id).execute()

            # Guarda o maior UID atual para só processar emails novos
            all_uids = client.search(["ALL"])
            last_uid = max(all_uids) if all_uids else 0
            self.account_info[acc_id]["last_uid"] = last_uid
            print(f"Último UID: {last_uid}. Pronto para receber novos emails")

        except Exception as e:
            print(f"Erro ao conectar conta email {acc_id}: {e}")
            self._mark_account_error(acc_id, str(e))

    async def _disconnect_account(self, acc_id: str):
        """Desconecta uma conta."""
        if acc_id in self.heartbeats:
            await self.heartbeats[acc_id].stop()
            del self.heartbeats[acc_id]

        if acc_id in self.clients:
            try:
                self.clients[acc_id].logout()
            except:
                pass
            del self.clients[acc_id]

        if acc_id in self.account_info:
            del self.account_info[acc_id]

        print(f"Conta email {acc_id} desconectada")

    async def _check_all_accounts(self):
        """Verifica novas mensagens em todas as contas."""
        print(f"[POLL] Verificando {len(self.clients)} contas...", flush=True)
        for acc_id in list(self.clients.keys()):
            try:
                await self._fetch_new_emails(acc_id)
            except Exception as e:
                print(f"Erro ao verificar emails {acc_id}: {e}")
                # Tenta reconectar
                if acc_id in self.account_info:
                    try:
                        self.clients[acc_id].logout()
                    except:
                        pass
                    del self.clients[acc_id]

    async def _fetch_new_emails(self, acc_id: str):
        """Busca emails nao lidos (apenas novos, apos conectar)."""
        if acc_id not in self.clients:
            return

        client = self.clients[acc_id]
        info = self.account_info[acc_id]
        db = get_supabase()

        try:
            # Busca emails com UID maior que o último processado (independente de lido/não lido)
            last_uid = info.get("last_uid", 0)

            # Busca por UID range ao invés de UNSEEN
            new_messages = client.search(["UID", f"{last_uid + 1}:*"])

            # Filtra UIDs válidos (IMAP pode retornar o último se não houver novos)
            new_messages = [uid for uid in new_messages if uid > last_uid]

            if new_messages:
                print(f"Novos emails: {len(new_messages)} (UIDs > {last_uid})", flush=True)

            for uid in new_messages:
                # Busca email completo
                raw_data = client.fetch([uid], ["RFC822", "ENVELOPE"])

                if uid not in raw_data:
                    continue

                raw_email = raw_data[uid][b"RFC822"]
                msg = email.message_from_bytes(raw_email, policy=policy.default)

                await self._process_incoming_email(acc_id, info["owner_id"], msg, uid)

                # Atualiza last_uid após processar
                info["last_uid"] = max(info.get("last_uid", 0), uid)

        except Exception as e:
            print(f"Erro ao buscar emails {acc_id}: {e}")
            raise

    async def _process_incoming_email(self, acc_id: str, owner_id: str, msg: email.message.Message, uid: int):
        """Processa email recebido."""
        try:
            db = get_supabase()

            message_id = msg.get("Message-ID", f"<{uuid4()}@local>")
            in_reply_to = msg.get("In-Reply-To")
            references = msg.get("References", "")
            from_addr = parseaddr(msg.get("From", ""))[1]
            to_addr = parseaddr(msg.get("To", ""))[1]
            subject = msg.get("Subject", "")

            # Verifica se ja processou
            existing = db.table("messages").select("id").eq(
                "external_message_id", message_id
            ).eq("integration_account_id", acc_id).execute()

            if existing.data:
                return  # Ja processado

            # Extrai corpo do email e attachments
            body = ""
            html_body = None
            attachments = []

            if msg.is_multipart():
                for part in msg.walk():
                    content_type = part.get_content_type()
                    content_disposition = part.get("Content-Disposition", "")

                    # Texto plano
                    if content_type == "text/plain" and "attachment" not in content_disposition:
                        try:
                            body = part.get_content()
                        except Exception:
                            pass
                    # HTML
                    elif content_type == "text/html" and "attachment" not in content_disposition:
                        try:
                            html_body = part.get_content()
                        except Exception:
                            pass
                    # Attachments (imagens, PDFs, etc)
                    elif content_type.startswith("image/") or content_type.startswith("application/") or "attachment" in content_disposition:
                        try:
                            payload = part.get_payload(decode=True)
                            if payload:
                                filename = part.get_filename() or f"attachment_{len(attachments)}"
                                # Decodifica filename se necessário
                                if filename:
                                    decoded_parts = decode_header(filename)
                                    filename = "".join(
                                        part.decode(enc or "utf-8") if isinstance(part, bytes) else part
                                        for part, enc in decoded_parts
                                    )
                                attachments.append({
                                    "data": payload,
                                    "filename": filename,
                                    "mime_type": content_type,
                                })
                        except Exception as e:
                            print(f"Erro ao extrair attachment: {e}")
            else:
                content_type = msg.get_content_type()
                if content_type == "text/plain":
                    body = msg.get_content()
                elif content_type == "text/html":
                    html_body = msg.get_content()

            # Extrai nome do remetente e busca/cria identity
            from_header = msg.get("From", "")
            display_name = self._extract_name_from_header(from_header)
            identity = await self._get_or_create_identity(db, owner_id, from_addr, display_name)

            # Busca conversa por threading ou cria nova
            conversation = await self._get_or_create_conversation(
                db, owner_id, identity["id"], identity.get("contact_id"),
                in_reply_to, references, acc_id
            )

            # Cria mensagem
            now = datetime.now(timezone.utc).isoformat()
            msg_id = str(uuid4())

            db.table("messages").insert({
                "id": msg_id,
                "owner_id": owner_id,
                "conversation_id": conversation["id"],
                "integration_account_id": acc_id,
                "identity_id": identity["id"],
                "channel": "email",
                "direction": "inbound",
                "text": body,
                "html": html_body,
                "subject": subject,
                "from_address": from_addr,
                "to_address": to_addr,
                "sent_at": now,
                "external_message_id": message_id,
                "external_reply_to_message_id": in_reply_to,
                "raw_payload": {"references": references},
            }).execute()

            # Atualiza conversa
            db.table("conversations").update({
                "last_message_at": now,
                "last_channel": "email",
            }).eq("id", conversation["id"]).execute()

            # Processa attachments
            if attachments:
                for att in attachments:
                    try:
                        att_id = str(uuid4())
                        # Caminho no storage: owner_id/message_id/filename
                        safe_filename = re.sub(r'[^\w\-.]', '_', att["filename"])
                        storage_path = f"{owner_id}/{msg_id}/{safe_filename}"

                        # Upload para Supabase Storage
                        db.storage.from_("attachments").upload(
                            storage_path,
                            att["data"],
                            {"content-type": att["mime_type"]}
                        )

                        # Cria registro no banco
                        db.table("attachments").insert({
                            "id": att_id,
                            "owner_id": owner_id,
                            "message_id": msg_id,
                            "storage_bucket": "attachments",
                            "storage_path": storage_path,
                            "file_name": att["filename"],
                            "mime_type": att["mime_type"],
                            "file_size": len(att["data"]),
                        }).execute()

                        print(f"Attachment salvo: {att['filename']}")
                    except Exception as e:
                        print(f"Erro ao salvar attachment {att['filename']}: {e}")

            print(f"Email recebido de {from_addr}: {subject[:50]}...")

        except Exception as e:
            print(f"Erro ao processar email: {e}")

    async def _process_outbound_messages(self):
        """Processa mensagens outbound pendentes."""
        db = get_supabase()

        # Busca mensagens outbound nao enviadas
        result = db.table("messages").select(
            "id, conversation_id, integration_account_id, identity_id, text, html, subject, external_reply_to_message_id"
        ).eq("direction", "outbound").eq(
            "channel", "email"
        ).like("external_message_id", "local-%").limit(10).execute()

        for msg in result.data:
            await self._send_email_message(msg)

    async def _send_email_message(self, message: dict):
        """Envia uma mensagem via SMTP."""
        acc_id = message.get("integration_account_id")

        if not acc_id or acc_id not in self.account_info:
            return

        info = self.account_info[acc_id]
        config = info["config"]
        password = info["password"]
        db = get_supabase()

        try:
            # Busca email do destinatario
            identity_result = db.table("contact_identities").select(
                "value"
            ).eq("id", message["identity_id"]).execute()

            if not identity_result.data:
                print(f"Identity {message['identity_id']} nao encontrada")
                return

            to_email = identity_result.data[0]["value"]
            from_email = config.get("email")
            smtp_host = config.get("smtp_host", "smtp.gmail.com")
            smtp_port = config.get("smtp_port", 587)

            # Cria email
            msg = EmailMessage()
            msg["From"] = from_email
            msg["To"] = to_email
            msg["Subject"] = message.get("subject") or "Re: Conversa"
            msg["Date"] = formatdate(localtime=True)
            msg["Message-ID"] = make_msgid()

            # Threading headers
            if message.get("external_reply_to_message_id"):
                msg["In-Reply-To"] = message["external_reply_to_message_id"]
                msg["References"] = message["external_reply_to_message_id"]

            # Corpo
            if message.get("html"):
                msg.set_content(message.get("text") or "")
                msg.add_alternative(message["html"], subtype="html")
            else:
                msg.set_content(message.get("text") or "")

            # Envia via SMTP
            if smtp_port == 465:
                # SSL implicito (porta 465)
                with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
                    server.login(from_email, password)
                    server.send_message(msg)
            else:
                # STARTTLS (porta 587)
                with smtplib.SMTP(smtp_host, smtp_port) as server:
                    server.starttls()
                    server.login(from_email, password)
                    server.send_message(msg)

            # Salva na pasta Sent via IMAP
            try:
                imap_host = config.get("imap_host", "imap.gmail.com")
                imap_port = config.get("imap_port", 993)
                imap_client = IMAPClient(imap_host, port=imap_port, ssl=True)
                imap_client.login(from_email, password)

                # Tenta encontrar pasta Sent (varia por servidor)
                sent_folders = ["Sent", "INBOX.Sent", "Sent Items", "Sent Messages", "[Gmail]/Sent Mail"]
                sent_folder = None
                folders = imap_client.list_folders()
                for flags, delimiter, name in folders:
                    if name in sent_folders or "sent" in name.lower():
                        sent_folder = name
                        break

                if sent_folder:
                    imap_client.append(sent_folder, msg.as_bytes(), flags=["\\Seen"])
                    print(f"Email salvo em {sent_folder}")

                imap_client.logout()
            except Exception as imap_err:
                print(f"Aviso: nao salvou em Sent: {imap_err}")

            # Atualiza external_message_id com Message-ID real
            db.table("messages").update({
                "external_message_id": msg["Message-ID"],
                "from_address": from_email,
                "to_address": to_email,
            }).eq("id", message["id"]).execute()

            print(f"Email enviado para {to_email}")

        except Exception as e:
            print(f"Erro ao enviar email {message['id']}: {e}")
            db.table("messages").update({
                "external_message_id": f"error-{message['id']}",
            }).eq("id", message["id"]).execute()

    def _mark_account_error(self, acc_id: str, error: str):
        """Marca erro na conta."""
        db = get_supabase()
        db.table("integration_accounts").update({
            "last_error": error,
        }).eq("id", acc_id).execute()

    def _extract_name_from_header(self, header: str) -> str | None:
        """Extrai nome do header 'Name <email@example.com>'."""
        if not header:
            return None

        # Tenta decodificar header encoded (=?UTF-8?Q?...?=)
        try:
            decoded_parts = decode_header(header)
            decoded = ""
            for part, enc in decoded_parts:
                if isinstance(part, bytes):
                    decoded += part.decode(enc or "utf-8", errors="replace")
                else:
                    decoded += part
            header = decoded.strip()
        except:
            pass

        # Extrai nome antes do <email>
        match = re.match(r'^"?([^"<]+)"?\s*<', header)
        if match:
            name = match.group(1).strip().strip('"')
            # Verifica se nao e o proprio email
            if name and "@" not in name:
                return name

        return None

    async def _get_or_create_identity(self, db, owner_id: str, email_addr: str, display_name: str | None = None) -> dict:
        """Busca ou cria identity para o email, com nome do remetente."""
        result = db.table("contact_identities").select(
            "id, contact_id, metadata"
        ).eq("owner_id", owner_id).eq(
            "type", "email"
        ).eq("value", email_addr.lower()).execute()

        if result.data:
            identity = result.data[0]
            # Atualiza nome se descobrimos e nao tinha
            if display_name:
                current_meta = identity.get("metadata") or {}
                if not current_meta.get("display_name"):
                    db.table("contact_identities").update({
                        "metadata": {**current_meta, "display_name": display_name}
                    }).eq("id", identity["id"]).execute()
            return identity

        # Cria identity com nome
        identity_id = str(uuid4())
        metadata = {"email": email_addr}
        if display_name:
            metadata["display_name"] = display_name

        db.table("contact_identities").insert({
            "id": identity_id,
            "owner_id": owner_id,
            "contact_id": None,
            "type": "email",
            "value": email_addr.lower(),
            "metadata": metadata,
        }).execute()

        return {"id": identity_id, "contact_id": None}

    async def _get_or_create_conversation(
        self, db, owner_id: str, identity_id: str, contact_id: str | None,
        in_reply_to: str | None, references: str, acc_id: str
    ) -> dict:
        """Busca ou cria conversa. Usa threading headers para encontrar conversa existente."""

        # Tenta encontrar conversa pelo threading (In-Reply-To ou References)
        if in_reply_to:
            result = db.table("messages").select(
                "conversation_id"
            ).eq("owner_id", owner_id).eq(
                "external_message_id", in_reply_to
            ).limit(1).execute()

            if result.data:
                return {"id": result.data[0]["conversation_id"]}

        # Tenta por References
        if references:
            ref_list = references.split()
            for ref in ref_list:
                result = db.table("messages").select(
                    "conversation_id"
                ).eq("owner_id", owner_id).eq(
                    "external_message_id", ref.strip()
                ).limit(1).execute()

                if result.data:
                    return {"id": result.data[0]["conversation_id"]}

        # Se tem contact_id, busca conversa do contato
        if contact_id:
            result = db.table("conversations").select(
                "id"
            ).eq("owner_id", owner_id).eq("contact_id", contact_id).eq(
                "last_channel", "email"
            ).execute()

            if result.data:
                return result.data[0]

        # Busca conversa nao vinculada pela identity
        result = db.table("conversations").select(
            "id"
        ).eq("owner_id", owner_id).eq("primary_identity_id", identity_id).is_(
            "contact_id", "null"
        ).execute()

        if result.data:
            return result.data[0]

        # Busca workspace_id da conta de integracao
        workspace_id = None
        acc_result = db.table("integration_accounts").select(
            "workspace_id"
        ).eq("id", acc_id).limit(1).execute()
        if acc_result.data and acc_result.data[0].get("workspace_id"):
            workspace_id = acc_result.data[0]["workspace_id"]
        else:
            # Fallback: busca primeiro workspace do owner
            ws_result = db.table("workspaces").select("id").eq(
                "owner_id", owner_id
            ).limit(1).execute()
            if ws_result.data:
                workspace_id = ws_result.data[0]["id"]

        # Cria nova conversa
        conv_id = str(uuid4())
        db.table("conversations").insert({
            "id": conv_id,
            "owner_id": owner_id,
            "workspace_id": workspace_id,
            "contact_id": contact_id,
            "primary_identity_id": identity_id,
            "status": "open",
            "last_channel": "email",
            "last_message_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        return {"id": conv_id}


async def main():
    worker = EmailWorker()
    await worker.start()


if __name__ == "__main__":
    asyncio.run(main())
