#!/bin/bash
# =============================================================================
# Setup Inicial do Droplet Digital Ocean
# Rodar como root no droplet recem-criado
# =============================================================================

set -e

echo "=== Setup Droplet para Inbox Multicanal ==="

# 1. Atualiza sistema
echo ">>> Atualizando sistema..."
apt update && apt upgrade -y

# 2. Instala Nginx e Certbot (para SSL)
echo ">>> Instalando Nginx e Certbot..."
apt install -y nginx certbot python3-certbot-nginx

# 3. Configura firewall
echo ">>> Configurando firewall..."
ufw allow 22      # SSH
ufw allow 80      # HTTP
ufw allow 443     # HTTPS
ufw --force enable

# 4. Cria diretorio do projeto
echo ">>> Criando diretorio do projeto..."
mkdir -p /opt/inbox-multicanal
cd /opt/inbox-multicanal

# 5. Clona repositorio (ajuste a URL!)
echo ">>> Clone o repositorio manualmente:"
echo "   git clone https://github.com/SEU_USUARIO/inbox-multicanal.git ."
echo ""

# 6. Instrucoes finais
echo "=== Setup concluido! ==="
echo ""
echo "Proximos passos:"
echo "1. Clone o repositorio em /opt/inbox-multicanal"
echo "2. Copie os arquivos .env para apps/api/.env e apps/workers/.env"
echo "3. Configure o Nginx: cp scripts/nginx-api.conf /etc/nginx/sites-available/api"
echo "4. Ative o site: ln -s /etc/nginx/sites-available/api /etc/nginx/sites-enabled/"
echo "5. Teste Nginx: nginx -t && systemctl reload nginx"
echo "6. Configure SSL: certbot --nginx -d api.SEUDOMINIO.com"
echo "7. Inicie os containers: docker-compose up -d"
