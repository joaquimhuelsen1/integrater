# Comandos Úteis - Inbox Multicanal

## Desenvolvimento Local

### Frontend (Next.js)
```bash
cd apps/web
npm install
npm run dev          # http://localhost:3000
```

### Backend (FastAPI) - Sem Docker
```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Com Docker (igual produção)
```bash
# Subir tudo
docker compose up -d --build

# Ver logs
docker compose logs -f

# Parar tudo
docker compose down

# Rebuild após mudanças
docker compose down
docker compose up -d --build
```

---

## Produção (Digital Ocean)

### Conectar no servidor
```bash
ssh root@64.23.142.132
# Senha: tCjthm7m81c
```

### Atualizar código
```bash
cd /opt/integrater
git pull origin main
docker compose down
docker compose up -d --build
```

tCjthm7m81c


supabase

NSVmY5rNjQ6osdZT


### Ver logs
```bash
docker logs inbox-api
docker logs inbox-telegram-worker
docker logs inbox-email-worker

# Logs em tempo real
docker logs -f inbox-api
```

### Reiniciar serviços
```bash
docker compose restart
docker compose restart api
```

### Ver status
```bash
docker ps
curl http://localhost:8000/health
```

### Editar variáveis de ambiente
```bash
nano apps/api/.env
nano apps/workers/.env
docker compose restart
```

---

## Git & Deploy

### Fluxo de deploy
```bash
# 1. Fazer alterações localmente
# 2. Commit e push
git add .
git commit -m "feat: descrição"
git push origin main

# 3. Vercel faz deploy automático do frontend

# 4. No servidor (SSH), atualizar backend
cd /opt/integrater
git pull origin main
docker compose down
docker compose up -d --build
```

---

## URLs

| Ambiente | Frontend | API |
|----------|----------|-----|
| **Local** | http://localhost:3000 | http://localhost:8000 |
| **Produção** | https://integrater.vercel.app | https://api.thereconquestmap.com |

---

## Troubleshooting

### API não responde
```bash
docker ps                              # Ver se está rodando
docker logs inbox-api                  # Ver erros
docker compose restart api             # Reiniciar
```

### Frontend não conecta na API
- Verificar NEXT_PUBLIC_API_URL na Vercel
- Verificar CORS (FRONTEND_URL no .env da API)

### SSL expirou
```bash
certbot renew
systemctl reload nginx
```

### Porta ocupada localmente
```bash
# Windows - encontrar processo na porta 8000
netstat -ano | findstr :8000
taskkill /PID <numero> /F
```
