---
motivo: Documentar uso do paramiko para SSH com senha no Windows
milestone: nenhum
data: 2026-01-03
area: api
impacto: baixo
---

# SSH com Senha via Paramiko (Windows)

## Contexto

Windows não tem `sshpass` nativo. Para automatizar SSH com senha, usamos a biblioteca Python `paramiko`.

## Instalação

```bash
pip install paramiko
```

## Uso Básico

```python
import paramiko

# Criar cliente SSH
ssh = paramiko.SSHClient()

# Aceitar chaves de hosts desconhecidos automaticamente
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

# Conectar com senha
ssh.connect(
    hostname='64.23.142.132',
    username='root',
    password='sua-senha-aqui'
)

# Executar comando
stdin, stdout, stderr = ssh.exec_command('docker ps')
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

# Fechar conexão
ssh.close()
```

## Exemplo Completo (Deploy)

```python
import paramiko

def deploy_to_server():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('64.23.142.132', username='root', password='tCjthm7m81c')
    
    commands = [
        'cd /opt/integrater && git pull origin main',
        'cd /opt/integrater && docker compose up -d --build',
    ]
    
    for cmd in commands:
        stdin, stdout, stderr = ssh.exec_command(cmd)
        print(f"CMD: {cmd}")
        print(stdout.read().decode('utf-8'))
        if stderr.read():
            print(f"ERRO: {stderr.read().decode('utf-8')}")
    
    ssh.close()

deploy_to_server()
```

## Alternativas

| Método | Prós | Contras |
|--------|------|---------|
| paramiko | Funciona em qualquer OS, programático | Precisa instalar biblioteca |
| subprocess + plink | Nativo Windows com PuTTY | Requer PuTTY instalado |
| WSL + sshpass | Funciona como Linux | Requer WSL configurado |

## Segurança

- **NUNCA** commitar senhas no código
- Use variáveis de ambiente: `os.environ.get('SSH_PASSWORD')`
- Para produção, prefira chaves SSH ao invés de senhas
