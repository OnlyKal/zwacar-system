/**
 * Client FlexPay (Infoset) — paiement des crédits par Mobile Money.
 *
 *  - Mobile Money : POST {mobileUrl}  → demande de paiement envoyée au téléphone du payeur
 *  - Vérification : GET  {checkUrl}/{orderNumber}
 *
 * Règle de sécurité : un callback FlexPay n'est JAMAIS cru sur parole. Le statut d'un paiement
 * n'est modifié qu'après vérification serveur → serveur via `check()` (montant et devise compris).
 */
const config = require('../../config');
const settings = require('../settings.service');
const { AppError } = require('../../utils/helpers');

const TIMEOUT_MS = 30000;

const providerError = (message) => new AppError(502, message, 'PAYMENT_PROVIDER');

async function getConfig() {
  return settings.getFlexpaySecret();
}

/** FlexPay est-il configuré et activé ? */
function isReady(c) {
  return Boolean(c.enabled && c.merchant && c.token && c.mobileUrl);
}

/**
 * Normalise un numéro congolais au format FlexPay : 243XXXXXXXXX.
 * Accepte 0812345678, 812345678, +243 812 345 678, 00243812345678…
 */
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('243')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return /^[89]\d{8}$/.test(d) ? `243${d}` : null;
}

function callbackUrl(c) {
  const base = (c.callbackBaseUrl || config.apiUrl).replace(/\/+$/, '');
  return `${base}/api/payments/webhook/flexpay`;
}

async function call(url, { method = 'GET', token, body } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw providerError(e.name === 'TimeoutError' ? 'FlexPay ne répond pas (délai dépassé)' : `FlexPay injoignable : ${e.message}`);
  }
  if (res.status === 401 || res.status === 403) throw providerError('FlexPay a refusé le jeton d’autorisation');
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw providerError(`Réponse FlexPay invalide (HTTP ${res.status})`);
  }
}

const amountStr = (n) => Number(n).toFixed(2);

/** Demande de paiement Mobile Money : le payeur confirme sur son téléphone. */
async function initiateMobile(payment, phone) {
  const c = await getConfig();
  if (!isReady(c)) throw AppError.badRequest('Le paiement Mobile Money n’est pas encore configuré');
  const r = await call(c.mobileUrl, {
    method: 'POST',
    token: c.token,
    body: {
      merchant: c.merchant,
      type: '1', // 1 = Mobile Money
      phone,
      reference: payment.reference,
      amount: amountStr(payment.amount),
      currency: payment.currency,
      callbackUrl: callbackUrl(c),
    },
  });
  if (String(r.code) !== '0' || !r.orderNumber) throw providerError(r.message ? `FlexPay : ${r.message}` : 'FlexPay a refusé la demande de paiement');
  return { orderNumber: r.orderNumber, message: r.message };
}

/**
 * Vérifie une transaction auprès de FlexPay.
 * @returns {{ found: boolean, status: 'completed'|'failed'|'pending', amount?: number, currency?: string, reference?: string, raw?: object }}
 */
async function check(orderNumber) {
  const c = await getConfig();
  if (!c.token || !c.checkUrl) throw AppError.badRequest('FlexPay n’est pas configuré');
  const r = await call(`${c.checkUrl.replace(/\/+$/, '')}/${encodeURIComponent(orderNumber)}`, { token: c.token });
  const t = r.transaction;
  if (String(r.code) !== '0' || !t) return { found: false, status: 'pending' };
  const st = String(t.status);
  return {
    found: true,
    // 0 = succès, 1 = échec ; tout autre code = transaction encore en cours.
    status: st === '0' ? 'completed' : st === '1' ? 'failed' : 'pending',
    amount: Number(t.amount),
    currency: t.currency,
    reference: t.reference,
    providerReference: t.provider_reference || t.providerReference || null,
    raw: t,
  };
}

/** Test des identifiants : une vérification d'une transaction fictive doit être acceptée (code 1 = introuvable). */
async function testConnection(override) {
  const c = { ...(await getConfig()), ...(override || {}) };
  if (!c.token) throw AppError.badRequest('Jeton d’autorisation manquant');
  const r = await call(`${c.checkUrl.replace(/\/+$/, '')}/ZWACAR-CONNECTION-TEST`, { token: c.token });
  return { ok: true, message: r.message || 'Connexion établie' };
}

module.exports = { getConfig, isReady, normalizePhone, callbackUrl, initiateMobile, check, testConnection };
