#!/usr/bin/env bash
# =====================================================================
# ZwaCar — déploiement depuis le poste de développement vers le VPS.
#   ./deploy/deploy.sh                          (clé ~/.ssh/id_ed25519_zwacar si présente)
#   ./deploy/deploy.sh "Message du commit"       (message facultatif pour GitHub)
#   NO_PUSH=1 ./deploy/deploy.sh                 (déployer sans pousser sur GitHub)
#
# 1. compile le Web Admin ; 2. envoie le code dans /opt/zwacar (sans données locales,
#    secrets ni dépendances) ; 3. exécute deploy/server-setup.sh sur le serveur ;
# 4. vérifie que le site répond, puis enregistre et pousse le code sur GitHub (branche courante).
# Les données du serveur (server/.env, server/storage) ne sont jamais écrasées.
# =====================================================================
set -euo pipefail

HOST=${HOST:-root@169.58.61.169}
APP_DIR=${APP_DIR:-/opt/zwacar}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE_URL=${SITE_URL:-https://www.zwacar.space}
COMMIT_MSG=${1:-"Déploiement $(date '+%Y-%m-%d %H:%M') sur ${SITE_URL#https://}"}
[ -z "${SSH_KEY:-}" ] && [ -f "$HOME/.ssh/id_ed25519_zwacar" ] && SSH_KEY="$HOME/.ssh/id_ed25519_zwacar"
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

echo "[deploy] Vérification du site en ligne"
for i in $(seq 1 20); do curl -fs "$SITE_URL/api/health" >/dev/null && break; sleep 2; done
curl -fs "$SITE_URL/api/health" >/dev/null || { echo "[deploy] ÉCHEC : $SITE_URL/api/health ne répond pas — rien n'est poussé sur GitHub."; exit 1; }
echo "[deploy] En ligne : $SITE_URL"

# ---------- Push GitHub après un déploiement réussi ----------
if [ -n "${NO_PUSH:-}" ]; then
  echo "[deploy] Push GitHub ignoré (NO_PUSH)"
elif git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  cd "$ROOT"
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -q -m "$COMMIT_MSG"
    echo "[deploy] Commit : $COMMIT_MSG"
  fi
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if git push -q origin "$BRANCH"; then
    echo "[deploy] Poussé sur GitHub ($BRANCH) : $(git log -1 --format='%h %s')"
  else
    echo "[deploy] ATTENTION : déploiement réussi mais push GitHub échoué — relancez : git push origin $BRANCH"
  fi
fi
