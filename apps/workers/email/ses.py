"""
Cliente Amazon SES para envio de emails via API.

Usa boto3 (AWS SDK) - funciona via HTTPS porta 443, nao precisa de portas SMTP.
Util como fallback quando SMTP esta bloqueado ou como alternativa principal.

Configuracao necessaria:
    AWS_ACCESS_KEY_ID=xxx
    AWS_SECRET_ACCESS_KEY=xxx
    AWS_REGION=us-east-1  # ou sa-east-1 para Sao Paulo
    
Antes de usar em producao:
    1. Verificar dominio ou email no SES Console
    2. Sair do sandbox (solicitar producao access)
    3. Configurar DKIM/SPF no DNS
"""

import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from email.utils import formatdate, make_msgid
from typing import Optional

import boto3
from botocore.exceptions import ClientError


def get_ses_client():
    """Cria cliente SES com credenciais do ambiente."""
    return boto3.client(
        "ses",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
    )


def is_ses_configured() -> bool:
    """Verifica se SES esta configurado (credenciais presentes)."""
    return bool(
        os.environ.get("AWS_ACCESS_KEY_ID")
        and os.environ.get("AWS_SECRET_ACCESS_KEY")
        and os.environ.get("USE_SES", "").lower() in ("true", "1", "yes")
    )


async def send_email_ses(
    from_email: str,
    to_email: str,
    subject: str,
    body_text: Optional[str] = None,
    body_html: Optional[str] = None,
    reply_to: Optional[str] = None,
    in_reply_to: Optional[str] = None,
    references: Optional[str] = None,
    attachments: Optional[list[bytes]] = None,
    attachment_names: Optional[list[str]] = None,
    attachment_types: Optional[list[str]] = None,
) -> dict:
    """
    Envia email via Amazon SES API.
    
    Args:
        from_email: Remetente (deve estar verificado no SES)
        to_email: Destinatario
        subject: Assunto
        body_text: Corpo em texto plano
        body_html: Corpo em HTML (opcional)
        reply_to: Email para respostas
        in_reply_to: Message-ID do email original (para threading)
        references: References header (para threading)
        attachments: Lista de bytes dos arquivos
        attachment_names: Nomes dos arquivos
        attachment_types: MIME types dos arquivos
    
    Returns:
        {success: bool, message_id: str?, error: str?}
    """
    try:
        client = get_ses_client()
        
        # Cria mensagem MIME
        msg = MIMEMultipart("mixed")
        msg["From"] = from_email
        msg["To"] = to_email
        msg["Subject"] = subject or "Sem assunto"
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid()
        
        # Headers de threading
        if reply_to:
            msg["Reply-To"] = reply_to
        if in_reply_to:
            msg["In-Reply-To"] = in_reply_to
        if references:
            msg["References"] = references
        
        # Corpo do email (texto + HTML)
        msg_body = MIMEMultipart("alternative")
        
        if body_text:
            text_part = MIMEText(body_text, "plain", "utf-8")
            msg_body.attach(text_part)
        
        if body_html:
            html_part = MIMEText(body_html, "html", "utf-8")
            msg_body.attach(html_part)
        elif body_text:
            # Se nao tem HTML, usa texto como fallback
            pass
        else:
            # Sem corpo - adiciona espaco vazio
            text_part = MIMEText("", "plain", "utf-8")
            msg_body.attach(text_part)
        
        msg.attach(msg_body)
        
        # Attachments
        if attachments:
            for i, file_bytes in enumerate(attachments):
                filename = attachment_names[i] if attachment_names and i < len(attachment_names) else f"attachment_{i}"
                mime_type = attachment_types[i] if attachment_types and i < len(attachment_types) else "application/octet-stream"
                
                maintype, subtype = mime_type.split("/", 1) if "/" in mime_type else ("application", "octet-stream")
                
                attachment_part = MIMEApplication(file_bytes, _subtype=subtype)
                attachment_part.add_header(
                    "Content-Disposition",
                    "attachment",
                    filename=filename
                )
                msg.attach(attachment_part)
        
        # Envia via SES
        response = client.send_raw_email(
            Source=from_email,
            Destinations=[to_email],
            RawMessage={"Data": msg.as_string()},
        )
        
        ses_message_id = response.get("MessageId", "")
        local_message_id = msg["Message-ID"]
        
        print(f"[SES] Email enviado para {to_email} (SES ID: {ses_message_id})")
        
        return {
            "success": True,
            "message_id": local_message_id,
            "ses_message_id": ses_message_id,
        }
        
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        error_msg = e.response.get("Error", {}).get("Message", str(e))
        print(f"[SES] Erro AWS {error_code}: {error_msg}")
        return {
            "success": False,
            "error": f"AWS SES Error ({error_code}): {error_msg}",
        }
        
    except Exception as e:
        print(f"[SES] Erro inesperado: {e}")
        return {
            "success": False,
            "error": str(e),
        }


async def verify_ses_identity(email_or_domain: str) -> dict:
    """
    Inicia verificacao de email ou dominio no SES.
    
    Para emails: SES envia email de confirmacao.
    Para dominios: Retorna tokens DKIM para adicionar no DNS.
    """
    try:
        client = get_ses_client()
        
        if "@" in email_or_domain:
            # Verificar email
            response = client.verify_email_identity(EmailAddress=email_or_domain)
            return {
                "success": True,
                "type": "email",
                "message": f"Email de verificacao enviado para {email_or_domain}",
            }
        else:
            # Verificar dominio com DKIM
            response = client.verify_domain_dkim(Domain=email_or_domain)
            dkim_tokens = response.get("DkimTokens", [])
            return {
                "success": True,
                "type": "domain",
                "dkim_tokens": dkim_tokens,
                "message": f"Adicione os seguintes registros CNAME no DNS: {dkim_tokens}",
            }
            
    except Exception as e:
        return {"success": False, "error": str(e)}


async def get_ses_send_quota() -> dict:
    """Retorna quota de envio atual do SES."""
    try:
        client = get_ses_client()
        response = client.get_send_quota()
        return {
            "success": True,
            "max_24_hour_send": response.get("Max24HourSend", 0),
            "max_send_rate": response.get("MaxSendRate", 0),
            "sent_last_24_hours": response.get("SentLast24Hours", 0),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
