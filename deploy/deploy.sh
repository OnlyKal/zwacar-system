#!/usr/bin/env bash
# =====================================================================
# ZwaCar — déploiement depuis le poste de développement vers le VPS.
#   ./deploy/deploy.sh                   (clé SSH par défaut)
#   SSH_KEY=~/.ssh/id_ed25519_zwacar ./deploy/deploy.sh
#
# 1. compile le Web Admin ; 2. envoie le code dans /opt/zwacar (sans données locales,
#    secrets ni dépendances) ; 3. exécute deploy/server-setup.sh sur le serveur.
# Les données du serveur (server/.env, server/storage) ne sont jamais écrasées.
# =====================================================================
set -euo pipefail

HOST=${HOST:-root@169.58.61.169}
APP_DIR=${APP_DIR:-/opt/zwacar}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_OPTS=(-o ConnectTimeout=15)
[ -n "${SSH_KEY:-}" ] && SSH_OPTS+=(-i "$SSH_KEY" -o IdentitiesOnly=yes)

echo "[deploy] Compilation du Web Admin"
(cd "$ROOT/web" && npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null)

echo "[deploy] Envoi du code vers $HOST:$APP_DIR"
ssh "${SSH_OPTS[@]}" "$HOST" "mkdir -p $APP_DIR/web && (command -v rsync >/dev/null || (apt-get update -qq && apt-get install -y -qq rsync))"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude 'node_modules/' --exclude '.env' --exclude '.seed-admin' --exclude 'storage/' --exclude '.DS_Store' \
  --exclude 'mobile/' --exclude 'web/src/' --exclude 'web/public/' \
  "$ROOT/server" "$ROOT/deploy" "$ROOT/README.md" "$HOST:$APP_DIR/"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" "$ROOT/web/dist/" "$HOST:$APP_DIR/web/dist/"

echo "[deploy] Installation / mise à jour sur le serveur"
ssh "${SSH_OPTS[@]}" "$HOST" "bash $APP_DIR/deploy/server-setup.sh"
