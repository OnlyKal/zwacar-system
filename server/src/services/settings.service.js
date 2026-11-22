/**
 * Paramètres de la plateforme stockés en base (clé → JSON).
 * Les valeurs sensibles (SMTP) sont chiffrées AES-256-GCM et ne sortent jamais de ce service en clair,
 * sauf vers le transport email.
 */
const { Setting } = require('../models');
const { DEFAULT_SETTINGS } = require('../utils/constants');
const { encrypt, decrypt } = require('../utils/helpers');

const cache = new Map();

async function get(key) {
  if (cache.has(key)) return cache.get(key);
  const row = await Setting.findByPk(key);
  let value = DEFAULT_SETTINGS[key] ? { ...DEFAULT_SETTINGS[key] } : null;
  if (row?.value) {
    const raw = row.encrypted ? decrypt(row.value) : row.value;
    const parsed = JSON.parse(raw);
    value = value && typeof parsed === 'object' ? { ...value, ...parsed } : parsed;
  }
  cache.set(key, value);
  return value;
}

async function set(key, value, { encrypted = false } = {}) {
  const raw = JSON.stringify(value);
  await Setting.upsert({ key, value: encrypted ? encrypt(raw) : raw, encrypted });
  cache.delete(key);
  return get(key);
}

const clearCache = () => cache.clear();

/* ---------------- SMTP ---------------- */
const SMTP_DEFAULTS = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: 'tls', // 'tls' (STARTTLS, port 587) | 'ssl' (port 465) | 'none'
  user: '',
  password: '',
  fromName: 'ZwaCar',
  replyTo: '',
  enabled: false,
};

/** Configuration SMTP complète (avec mot de passe) — usage interne uniquement. */
async function getSmtpSecret() {
  const v = await get('smtp');
  return { ...SMTP_DEFAULTS, ...(v || {}) };
}

/** Vue publique de la configuration SMTP : le mot de passe n'est JAMAIS renvoyé. */
async function getSmtpPublic() {
  const { password, ...rest } = await getSmtpSecret();
  return { ...rest, hasPassword: Boolean(password) };
}

async function setSmtp(input) {
  const current = await getSmtpSecret();
  const next = { ...current, ...input };
  // Mot de passe vide = conserver l'actuel (le frontend ne le connaît pas).
  if (!input.password) next.password = current.password;
  // Les mots de passe d'application Gmail sont affichés avec des espaces : on les retire.
  next.password = String(next.password || '').replace(/\s+/g, '');
  await set('smtp', next, { encrypted: true });
  return getSmtpPublic();
}

/* ---------------- FlexPay (paiement en ligne des crédits) ---------------- */
const FLEXPAY_DEFAULTS = {
  enabled: false,
  merchant: '',
  token: '',
  mobileUrl: 'https://backend.flexpay.cd/api/rest/v1/paymentService',
  checkUrl: 'https://backend.flexpay.cd/api/rest/v1/check',
  // URL publique de l'API (pour le callback). Vide = API_URL du serveur.
  callbackBaseUrl: '',
};

/** Configuration FlexPay complète (avec jeton) — usage interne uniquement. */
async function getFlexpaySecret() {
  const v = await get('flexpay');
  return { ...FLEXPAY_DEFAULTS, ...(v || {}) };
}

/** Vue publique : le jeton n'est JAMAIS renvoyé. */
async function getFlexpayPublic() {
  const { token, ...rest } = await getFlexpaySecret();
  return { ...rest, hasToken: Boolean(token) };
}

async function setFlexpay(input) {
  const current = await getFlexpaySecret();
  const next = { ...current, ...input };
  // Jeton vide = conserver l'actuel ; le préfixe « Bearer » éventuel est retiré.
  next.token = input.token ? String(input.token).trim().replace(/^Bearer\s+/i, '') : current.token;
  await set('flexpay', next, { encrypted: true });
  return getFlexpayPublic();
}

module.exports = { get, set, clearCache, getSmtpSecret, getSmtpPublic, setSmtp, getFlexpaySecret, getFlexpayPublic, setFlexpay };
