#!/bin/bash
# =============================================================================
# Script de Deploy - Inbox Multicanal
# Rodar no droplet para atualizar a aplicacao
# =============================================================================

set -e

PROJECT_DIR="/opt/inbox-multicanal"

echo "=== Deploy Inbox Multicanal ==="
cd $PROJECT_DIR

# 1. Pull do codigo mais recente
echo ">>> Atualizando codigo..."
git pull origin main

# 2. Para containers antigos
echo ">>> Parando containers..."
docker-compose down

# 3. Rebuild das imagens (--no-cache para garantir atualizacao)
echo ">>> Reconstruindo imagens..."
docker-compose build --no-cache

# 4. Inicia containers
echo ">>> Iniciando containers..."
docker-compose up -d

# 5. Aguarda API iniciar
echo ">>> Aguardando API iniciar..."
sleep 15

# 6. Verifica health
echo ">>> Verificando saude da API..."
if curl -sf http://localhost:8000/health > /dev/null; then
    echo ">>> API funcionando!"
else
    echo ">>> ERRO: API nao respondeu ao health check!"
    echo ">>> Verificando logs..."
    docker-compose logs --tail=50 api
    exit 1
fi

# 7. Verifica workers
echo ">>> Verificando workers..."
docker-compose ps

echo ""
echo "=== Deploy concluido com sucesso! ==="
echo ""
echo "Comandos uteis:"
echo "  docker-compose logs -f api           # Logs da API"
echo "  docker-compose logs -f telegram-worker  # Logs Telegram"
echo "  docker-compose logs -f email-worker     # Logs Email"
echo "  docker-compose ps                    # Status dos containers"
echo "  docker-compose restart api           # Reiniciar API"
