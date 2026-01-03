"""
Worker Email - Recebe e envia emails via IMAP/SMTP

ARQUITETURA COM n8n:
- Worker captura emails via IMAP e envia para webhooks n8n
- Worker expoe API HTTP para n8n enviar comandos de envio
- n8n orquestra toda a logica de negocio (criar identity, conversa, inserir mensagens)
- Worker mantem: conexao IMAP, envio SMTP, heartbeat

Uso:
    python worker.py

Env vars necessarias:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    ENCRYPTION_KEY
    N8N_API_KEY, N8N_WEBHOOK_EMAIL_INBOUND
    EMAIL_WORKER_API_KEY, EMAIL_WORKER_HTTP_PORT
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

import uvicorn
from dotenv import load_dotenv
from imapclient import IMAPClient

# Adiciona shared ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.db import get_supabase
from shared.crypto import decrypt
from shared.heartbeat import Heartbeat

# Importa modulos locais
from webhooks import notify_inbound_email, notify_outbound_email
from api import app as fastapi_app, set_worker, EMAIL_WORKER_HTTP_PORT

load_dotenv()


class EmailWorker:
    def __init__(self):
        self.clients: dict[str, IMAPClient] = {}
        self.heartbeats: dict[str, Heartbeat] = {}
        self.account_info: dict[str, dict] = {}  # acc_id -> {owner_id, config, password, ...}
        self.running = True

    async def start(self):
        """Inicia o worker com FastAPI + IMAP."""
        print("Email Worker iniciando...")
        
        # Registra este worker na API
        set_worker(self)
        
        # Configura servidor FastAPI
        config = uvicorn.Config(
            fastapi_app,
            host="0.0.0.0",
            port=EMAIL_WORKER_HTTP_PORT,
            log_level="info",
        )
        server = uvicorn.Server(config)
        
        print(f"[API] Servidor HTTP iniciando na porta {EMAIL_WORKER_HTTP_PORT}")
        
        # Inicia loops em paralelo
        await asyncio.gather(
            server.serve(),
            self._sync_loop(),
            self._idle_loop(),
            self._keepalive_loop(),  # NOOP keepalive para evitar desconexao
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

    async def _keepalive_loop(self):
        """Loop de NOOP keepalive para manter conexoes IMAP ativas."""
        while self.running:
            try:
                await asyncio.sleep(240)  # 4 minutos
                for acc_id, client in list(self.clients.items()):
                    try:
                        client.noop()
                        print(f"[NOOP] Keepalive enviado para {acc_id[:8]}...")
                    except Exception as e:
                        print(f"[NOOP] Erro {acc_id[:8]}: {e} - reconectando...")
                        # Marca para reconectar no proximo sync
                        if acc_id in self.clients:
                            try:
                                self.clients[acc_id].logout()
                            except:
                                pass
                            del self.clients[acc_id]
            except Exception as e:
                print(f"Erro no keepalive loop: {e}")
                await asyncio.sleep(10)

    async def _sync_accounts(self):
        """Sincroniza contas ativas do banco."""
        db = get_supabase()

        result = db.table("integration_accounts").select(
            "id, owner_id, secrets_encrypted, config, workspace_id"
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
        workspace_id = account.get("workspace_id")

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
                "workspace_id": workspace_id,
                "config": config,
                "password": password,
                "connected_at": datetime.now(timezone.utc),
            }

            print(f"Conta email {acc_id} ({email_address}) conectada")

            # Atualiza last_sync_at
            db = get_supabase()
            db.table("integration_accounts").update({
                "last_sync_at": datetime.now(timezone.utc).isoformat(),
                "last_error": None,
            }).eq("id", acc_id).execute()

            # Le last_email_uid do banco (config JSONB) ou usa max(UID) como fallback
            saved_uid = config.get("last_email_uid")
            if saved_uid:
                last_uid = saved_uid
                print(f"Ultimo UID do banco: {last_uid}")
            else:
                # Primeira vez - usa max(UID) atual
                all_uids = client.search(["ALL"])
                last_uid = max(all_uids) if all_uids else 0
                print(f"Primeiro sync - ultimo UID: {last_uid}")
                # Salva no banco para proxima vez
                self._save_last_uid(acc_id, last_uid)
            
            self.account_info[acc_id]["last_uid"] = last_uid
            print(f"Pronto para receber novos emails (UID > {last_uid})")

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
        """Busca emails novos (apos conectar)."""
        if acc_id not in self.clients:
            return

        client = self.clients[acc_id]
        info = self.account_info[acc_id]

        try:
            # Re-seleciona INBOX para ver novos emails (IMAP nao notifica automaticamente)
            client.select_folder("INBOX")
            
            # Busca emails com UID maior que o ultimo processado
            last_uid = info.get("last_uid", 0)
            new_messages = client.search(["UID", f"{last_uid + 1}:*"])
            
            # Filtra UIDs validos
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

                await self._process_incoming_email(acc_id, msg, uid)

                # Atualiza last_uid apos processar (memoria + banco)
                new_uid = max(info.get("last_uid", 0), uid)
                info["last_uid"] = new_uid
                self._save_last_uid(acc_id, new_uid)

        except Exception as e:
            print(f"Erro ao buscar emails {acc_id}: {e}")
            raise

    async def _process_incoming_email(self, acc_id: str, msg: email.message.Message, uid: int):
        """Processa email recebido - envia para n8n."""
        try:
            info = self.account_info[acc_id]
            owner_id = info["owner_id"]
            workspace_id = info.get("workspace_id")

            message_id = msg.get("Message-ID", f"<{uuid4()}@local>")
            in_reply_to = msg.get("In-Reply-To")
            references = msg.get("References", "")
            from_addr = parseaddr(msg.get("From", ""))[1]
            to_addr = parseaddr(msg.get("To", ""))[1]
            subject = msg.get("Subject", "")
            date_header = msg.get("Date")

            # Parse date
            timestamp = datetime.now(timezone.utc)
            if date_header:
                try:
                    from email.utils import parsedate_to_datetime
                    timestamp = parsedate_to_datetime(date_header)
                except Exception:
                    pass

            # Extrai nome do remetente
            sender_name = self._extract_name_from_header(msg.get("From", ""))

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
                    # Attachments
                    elif content_type.startswith("image/") or content_type.startswith("application/") or "attachment" in content_disposition:
                        attachment_data = await self._process_attachment(part, acc_id, uid)
                        if attachment_data:
                            attachments.append(attachment_data)
            else:
                content_type = msg.get_content_type()
                if content_type == "text/plain":
                    body = msg.get_content()
                elif content_type == "text/html":
                    html_body = msg.get_content()

            # Envia para n8n
            await notify_inbound_email(
                account_id=acc_id,
                owner_id=owner_id,
                workspace_id=workspace_id,
                from_email=from_addr,
                to_email=to_addr,
                subject=subject,
                body=body,
                html=html_body,
                attachments=attachments,
                message_id=message_id,
                in_reply_to=in_reply_to,
                references=references,
                timestamp=timestamp,
                sender_name=sender_name,
            )

            print(f"Email recebido de {from_addr}: {subject[:50]}...")

        except Exception as e:
            print(f"Erro ao processar email: {e}")
            import traceback
            traceback.print_exc()

    async def _process_attachment(self, part, acc_id: str, uid: int) -> dict | None:
        """Processa attachment - faz upload para Supabase Storage."""
        try:
            payload = part.get_payload(decode=True)
            if not payload:
                return None

            filename = part.get_filename() or f"attachment_{uid}"
            mime_type = part.get_content_type()

            # Decodifica filename se necessario
            if filename:
                decoded_parts = decode_header(filename)
                filename = "".join(
                    p.decode(enc or "utf-8") if isinstance(p, bytes) else p
                    for p, enc in decoded_parts
                )

            # Sanitiza filename
            safe_filename = re.sub(r'[^\w\-.]', '_', filename)
            storage_path = f"email/inbound/{acc_id}/{uid}/{safe_filename}"

            # Upload para Supabase Storage
            db = get_supabase()
            db.storage.from_("attachments").upload(
                storage_path,
                payload,
                {"content-type": mime_type}
            )

            # Gera URL publica
            supabase_url = os.environ.get("SUPABASE_URL", "")
            public_url = f"{supabase_url}/storage/v1/object/public/attachments/{storage_path}"

            print(f"Attachment salvo: {filename}")

            return {
                "url": public_url,
                "filename": filename,
                "mime_type": mime_type,
                "size": len(payload),
            }

        except Exception as e:
            print(f"Erro ao processar attachment: {e}")
            return None

    async def send_email_via_api(
        self,
        account_id: str,
        to_email: str,
        subject: str | None,
        body: str | None,
        html: str | None,
        in_reply_to: str | None,
        attachments: list[str],
    ) -> dict:
        """
        Envia email via SMTP - chamado pela API quando n8n solicita.
        
        Returns:
            {success: bool, message_id: str?, error: str?}
        """
        if account_id not in self.account_info:
            return {"success": False, "error": f"Conta {account_id} nao conectada"}

        info = self.account_info[account_id]
        config = info["config"]
        password = info["password"]
        owner_id = info["owner_id"]
        workspace_id = info.get("workspace_id")

        try:
            from_email = config.get("email")
            smtp_host = config.get("smtp_host", "smtp.gmail.com")
            smtp_port = config.get("smtp_port", 587)

            # Cria email
            msg = EmailMessage()
            msg["From"] = from_email
            msg["To"] = to_email
            msg["Subject"] = subject or "Sem assunto"
            msg["Date"] = formatdate(localtime=True)
            msg["Message-ID"] = make_msgid()

            # Threading headers
            if in_reply_to:
                msg["In-Reply-To"] = in_reply_to
                msg["References"] = in_reply_to

            # Corpo
            if html:
                msg.set_content(body or "")
                msg.add_alternative(html, subtype="html")
            else:
                msg.set_content(body or "")

            # Processa attachments (baixa URLs e anexa)
            if attachments:
                await self._add_attachments_to_email(msg, attachments)

            # Envia via SMTP
            if smtp_port == 465:
                with smtplib.SMTP_SSL(smtp_host, smtp_port) as server:
                    server.login(from_email, password)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(smtp_host, smtp_port) as server:
                    server.starttls()
                    server.login(from_email, password)
                    server.send_message(msg)

            # Salva na pasta Sent via IMAP
            await self._save_to_sent_folder(account_id, msg, config, from_email, password)

            message_id = msg["Message-ID"]
            print(f"Email enviado para {to_email}: {subject}")

            # Notifica n8n sobre o envio (para confirmacao)
            await notify_outbound_email(
                account_id=account_id,
                owner_id=owner_id,
                workspace_id=workspace_id,
                from_email=from_email,
                to_email=to_email,
                subject=subject,
                body=body,
                html=html,
                attachments=None,  # n8n ja tem os URLs
                message_id=message_id,
                in_reply_to=in_reply_to,
                timestamp=datetime.now(timezone.utc),
            )

            return {"success": True, "message_id": message_id}

        except Exception as e:
            print(f"Erro ao enviar email: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    async def _add_attachments_to_email(self, msg: EmailMessage, attachment_urls: list[str]):
        """Baixa attachments das URLs e adiciona ao email."""
        import httpx

        for url in attachment_urls:
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    response = await client.get(url)
                    if response.status_code != 200:
                        print(f"Erro ao baixar attachment: {response.status_code}")
                        continue

                    file_bytes = response.content
                    content_type = response.headers.get("content-type", "application/octet-stream")
                    filename = url.split("/")[-1].split("?")[0]

                    # Adiciona ao email
                    maintype, subtype = content_type.split("/", 1) if "/" in content_type else ("application", "octet-stream")
                    msg.add_attachment(
                        file_bytes,
                        maintype=maintype,
                        subtype=subtype,
                        filename=filename
                    )
                    print(f"Attachment adicionado: {filename}")

            except Exception as e:
                print(f"Erro ao adicionar attachment {url}: {e}")

    async def _save_to_sent_folder(self, acc_id: str, msg: EmailMessage, config: dict, from_email: str, password: str):
        """Salva email na pasta Sent via IMAP."""
        try:
            imap_host = config.get("imap_host", "imap.gmail.com")
            imap_port = config.get("imap_port", 993)
            imap_client = IMAPClient(imap_host, port=imap_port, ssl=True)
            imap_client.login(from_email, password)

            # Tenta encontrar pasta Sent
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

        except Exception as e:
            print(f"Aviso: nao salvou em Sent: {e}")

    def _mark_account_error(self, acc_id: str, error: str):
        """Marca erro na conta."""
        db = get_supabase()
        db.table("integration_accounts").update({
            "last_error": error,
        }).eq("id", acc_id).execute()

    def _save_last_uid(self, acc_id: str, uid: int):
        """Salva last_email_uid no banco (config JSONB)."""
        try:
            db = get_supabase()
            # Busca config atual
            result = db.table("integration_accounts").select("config").eq("id", acc_id).single().execute()
            config = result.data.get("config") or {}
            config["last_email_uid"] = uid
            
            # Atualiza
            db.table("integration_accounts").update({
                "config": config
            }).eq("id", acc_id).execute()
        except Exception as e:
            print(f"Erro ao salvar last_uid: {e}")

    def _extract_name_from_header(self, header: str) -> str | None:
        """Extrai nome do header 'Name <email@example.com>'."""
        if not header:
            return None

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

        match = re.match(r'^"?([^"<]+)"?\s*<', header)
        if match:
            name = match.group(1).strip().strip('"')
            if name and "@" not in name:
                return name

        return None


async def main():
    worker = EmailWorker()
    await worker.start()


if __name__ == "__main__":
    asyncio.run(main())
