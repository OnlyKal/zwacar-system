#!/usr/bin/env bash
# =====================================================================
# ZwaCar — installation / mise à jour sur le VPS (Ubuntu / Debian), en root.
#   Domaine : www.zwacar.space (zwacar.space redirigé)    Dossier : /opt/zwacar
#
# Idempotent : peut être relancé à chaque déploiement.
#  - n'installe que ce qui manque (Node 22, MySQL, Nginx, Certbot, PM2) ;
#  - crée la base et l'utilisateur MySQL s'ils n'existent pas ;
#  - génère server/.env (secrets aléatoires) UNIQUEMENT s'il n'existe pas ;
#  - n'écrit que son propre site Nginx (les autres sites du serveur ne sont pas touchés).
# =====================================================================
set -euo pipefail

APP_DIR=/opt/zwacar
DOMAIN=www.zwacar.space
APEX=zwacar.space
PORT=${ZWACAR_PORT:-4100}
ADMIN_EMAIL=${ZWACAR_ADMIN_EMAIL:-admin@zwacar.space}
CERT_EMAIL=${ZWACAR_CERT_EMAIL:-$ADMIN_EMAIL}

log() { printf '\n\033[1;33m[zwacar]\033[0m %s\n' "$*"; }
rand() { openssl rand -hex "$1"; }

[ "$(id -u)" = 0 ] || { echo "À exécuter en root"; exit 1; }
[ -d "$APP_DIR/server" ] || { echo "$APP_DIR/server introuvable : envoyez d'abord le code (deploy.sh)"; exit 1; }

# ---------- 1. Paquets système ----------
export DEBIAN_FRONTEND=noninteractive
need=()
command -v nginx >/dev/null || need+=(nginx)
command -v mysql >/dev/null || need+=(mysql-server)
command -v certbot >/dev/null || need+=(certbot python3-certbot-nginx)
command -v rsync >/dev/null || need+=(rsync)
if [ ${#need[@]} -gt 0 ]; then
  log "Installation : ${need[*]}"
  apt-get update -qq && apt-get install -y -qq "${need[@]}"
fi
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  log "Installation de Node.js 22 LTS"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
command -v pm2 >/dev/null || { log "Installation de PM2"; npm install -g pm2 >/dev/null; }
systemctl enable --now mysql nginx >/dev/null 2>&1 || true

# Le port de l'API doit être libre (ou déjà utilisé par ZwaCar).
if ss -ltnp 2>/dev/null | grep -q ":$PORT " && ! pm2 describe zwacar-api >/dev/null 2>&1; then
  echo "Le port $PORT est déjà utilisé par un autre service. Relancez avec ZWACAR_PORT=<port libre>."; exit 1
fi

# ---------- 2. Configuration (.env) — créée une seule fois ----------
ENV_FILE="$APP_DIR/server/.env"
SEED_FILE="$APP_DIR/server/.seed-admin"   # mot de passe initial, supprimé après l'initialisation
if [ ! -f "$ENV_FILE" ]; then
  DB_PASS=$(rand 24)
  ( umask 077; echo "Zw$(rand 8)A9" > "$SEED_FILE" )
  log "Création de la base MySQL et de $ENV_FILE"
  mysql <<SQL
CREATE DATABASE IF NOT EXISTS zwacar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'zwacar'@'localhost' IDENTIFIED BY '$DB_PASS';
ALTER USER 'zwacar'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON zwacar.* TO 'zwacar'@'localhost';
FLUSH PRIVILEGES;
SQL
  umask 077
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=$PORT
APP_NAME=ZwaCar
WEB_URL=https://$DOMAIN
API_URL=https://$DOMAIN
CORS_ORIGINS=https://$DOMAIN,https://$APEX
SERVE_WEB=true
WEB_DIST=../web/dist
API_DOCS=false
DB_DIALECT=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=zwacar
DB_USER=zwacar
DB_PASSWORD=$DB_PASS
JWT_ACCESS_SECRET=$(rand 48)
JWT_REFRESH_SECRET=$(rand 48)
ENCRYPTION_KEY=$(rand 32)
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=30
STORAGE_DIR=storage
JOBS_ENABLED=true
CRON_EXPIRATIONS=0 * * * *
ENV
  umask 022
fi
chmod 600 "$ENV_FILE"

# ---------- 3. Dépendances, schéma, données de base ----------
log "Installation des dépendances de l'API"
cd "$APP_DIR/server"
npm ci --omit=dev --no-audit --no-fund >/dev/null
mkdir -p storage/uploads storage/backups

if [ -f "$SEED_FILE" ]; then
  log "Initialisation : super administrateur, catégories, moyens de paiement (sans démo)"
  ADMIN_PASS=$(cat "$SEED_FILE")
  SEED_ADMIN_EMAIL="$ADMIN_EMAIL" SEED_ADMIN_PASSWORD="$ADMIN_PASS" NODE_ENV=production node src/scripts/seed.js --no-demo
  FIRST_INSTALL=1
else
  FIRST_INSTALL=0
  log "Mise à jour du schéma (non destructive)"
  NODE_ENV=production node src/scripts/sync.js
fi

# ---------- 4. Processus (PM2) ----------
log "Démarrage de l'API (PM2)"
if pm2 describe zwacar-api >/dev/null 2>&1; then
  pm2 reload zwacar-api --update-env >/dev/null
else
  pm2 start "$APP_DIR/deploy/ecosystem.config.cjs" >/dev/null
fi
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

for i in $(seq 1 30); do curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 1; done
curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null || { echo "L'API ne répond pas : pm2 logs zwacar-api"; exit 1; }

# ---------- 5. Nginx + HTTPS ----------
SITE=/etc/nginx/sites-available/zwacar
if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
  log "Site Nginx temporaire (HTTP) pour obtenir le certificat"
  cat > "$SITE" <<NGX
server {
    listen 80;
    server_name $DOMAIN $APEX;
    client_max_body_size 150m;
    location / { proxy_pass http://127.0.0.1:$PORT; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
}
NGX
  ln -sf "$SITE" /etc/nginx/sites-enabled/zwacar
  nginx -t && systemctl reload nginx
  log "Certificat Let's Encrypt pour $DOMAIN et $APEX"
  certbot certonly --nginx -d "$DOMAIN" -d "$APEX" --non-interactive --agree-tos -m "$CERT_EMAIL"
fi
sed -e "s/__PORT__/$PORT/g" "$APP_DIR/deploy/nginx-zwacar.space.conf" > "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/zwacar
nginx -t && systemctl reload nginx

curl -fs "https://$DOMAIN/api/health" >/dev/null && log "En ligne : https://$DOMAIN" || log "Vérifiez le pare-feu (ports 80/443) puis https://$DOMAIN"

if [ "$FIRST_INSTALL" = 1 ]; then
  printf '\n=====================================================\n'
  printf ' Super administrateur : %s\n Mot de passe initial : %s\n' "$ADMIN_EMAIL" "$ADMIN_PASS"
  printf ' → changez-le dès la première connexion (Mon compte).\n'
  printf ' Conservez une copie de %s (ENCRYPTION_KEY) hors du serveur.\n' "$ENV_FILE"
  printf '=====================================================\n'
  rm -f "$SEED_FILE"
fi
