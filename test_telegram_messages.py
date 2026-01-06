"""Script para testar iter_messages do grupo no servidor."""
import paramiko
import textwrap

# Conecta via SSH
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('64.23.142.132', username='root', password='tCjthm7m81c')

# Cria script de teste
test_script = textwrap.dedent('''
import asyncio
import os
import sys
sys.path.insert(0, '/app/shared')

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import MessageService
from db import get_supabase
from crypto import decrypt

async def test():
    db = get_supabase()
    
    # Pega primeira conta ativa
    result = db.table('integration_accounts').select('id, session_string').eq('is_active', True).limit(1).execute()
    if not result.data:
        print('Nenhuma conta ativa')
        return
    
    acc = result.data[0]
    session = decrypt(acc['session_string'])
    
    api_id = int(os.environ['TELEGRAM_API_ID'])
    api_hash = os.environ['TELEGRAM_API_HASH']
    
    client = TelegramClient(StringSession(session), api_id, api_hash)
    await client.connect()
    
    # Carrega dialogs primeiro (importante!)
    dialogs = await client.get_dialogs()
    print(f'Dialogs carregados: {len(dialogs)}')
    
    # Busca entity do grupo
    group_id = 2319605536
    entity = await client.get_entity(group_id)
    print(f'\\nGrupo: {getattr(entity, "title", "N/A")}')
    print(f'Entity ID: {entity.id}')
    
    # Busca ultimas 20 mensagens
    print('\\n=== Ultimas 20 mensagens ===')
    count = 0
    async for msg in client.iter_messages(entity, limit=20):
        count += 1
        date_str = msg.date.strftime('%Y-%m-%d %H:%M')
        msg_type = 'SERVICE' if isinstance(msg, MessageService) else 'MSG'
        text = getattr(msg, 'text', '') or getattr(msg, 'message', '') or ''
        text = text[:40] if text else '[no text/media]'
        action = ''
        if isinstance(msg, MessageService):
            action = type(msg.action).__name__ if msg.action else ''
        print(f'{count:2}. ID={msg.id:5} | {date_str} | {msg_type:7} | {action:30} | {text}')
    
    print(f'\\nTotal retornado: {count} mensagens')
    
    await client.disconnect()

asyncio.run(test())
''')

# Salva script no servidor
sftp = ssh.open_sftp()
with sftp.file('/tmp/test_messages.py', 'w') as f:
    f.write(test_script)
sftp.close()

# Executa no container
cmd = 'cd /opt/integrater && docker compose exec -T telegram-worker python /tmp/test_messages.py 2>&1'
stdin, stdout, stderr = ssh.exec_command(cmd, timeout=60)
print(stdout.read().decode('utf-8', errors='replace'))

ssh.close()
