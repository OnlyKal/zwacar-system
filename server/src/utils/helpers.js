/**
 * Utilitaires transverses : erreurs applicatives, chiffrement, références, pagination.
 */
const crypto = require('crypto');
const config = require('../config');

class AppError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
    this.details = details;
  }
  static badRequest(msg, details) { return new AppError(400, msg, 'BAD_REQUEST', details); }
  static unauthorized(msg = 'Authentification requise') { return new AppError(401, msg, 'UNAUTHORIZED'); }
  static forbidden(msg = 'Accès refusé') { return new AppError(403, msg, 'FORBIDDEN'); }
  static notFound(msg = 'Ressource introuvable') { return new AppError(404, msg, 'NOT_FOUND'); }
  static conflict(msg) { return new AppError(409, msg, 'CONFLICT'); }
  static payment(msg) { return new AppError(402, msg, 'INSUFFICIENT_CREDITS'); }
}

/** Message affiché à un collaborateur dont l'entreprise n'est pas active. */
function companyBlockedMessage(status) {
  if (status === 'pending') return 'Votre entreprise est en attente de validation par l’administrateur. Vous recevrez un email dès son activation.';
  if (status === 'rejected') return 'L’inscription de votre entreprise n’a pas été acceptée. Contactez le support pour plus d’informations.';
  return 'Entreprise suspendue';
}

/** Enveloppe un handler async pour transmettre les erreurs au middleware central. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------------- Chiffrement AES-256-GCM (identifiants SMTP) ---------------- */
function getKey() {
  const hex = config.encryptionKey;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  if (config.isProd) throw new Error('ENCRYPTION_KEY invalide (64 caractères hex requis)');
  // Développement : clé dérivée du secret JWT pour ne pas bloquer le démarrage.
  return crypto.createHash('sha256').update(String(config.jwt.accessSecret)).digest();
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

function decrypt(payload) {
  const [iv, tag, data] = String(payload).split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

/** Référence unique lisible : PREFIX-AAAAMMJJ-XXXXXX */
function makeReference(prefix) {
  const d = new Date();
  const date = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `${prefix}-${date}-${rand}`;
}

function slugify(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}

/** Lit page/limit depuis la query et renvoie offset/limit bornés. */
function paginate(query, defLimit = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defLimit));
  return { page, limit, offset: (page - 1) * limit };
}

function paged(rows, count, { page, limit }) {
  return { data: rows, meta: { page, limit, total: count, pages: Math.max(1, Math.ceil(count / limit)) } };
}

const addMonths = (date, n) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};

const clientIp = (req) => (req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '');

/** Construit l'URL publique d'un fichier média stocké. */
const mediaUrl = (p) => (p ? `${config.apiUrl}/uploads/${p}` : null);

module.exports = {
  companyBlockedMessage, AppError, ah, encrypt, decrypt, sha256, randomToken, makeReference, slugify, paginate, paged, addMonths, clientIp, mediaUrl };
