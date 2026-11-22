/**
 * Fournisseurs de paiement (architecture « plug-in »).
 *
 * Pour intégrer un nouveau moyen de paiement :
 *   1. Créer un objet respectant l'interface ci-dessous ;
 *   2. L'enregistrer dans `registry` ;
 *   3. Le Super Administrateur crée un moyen de paiement utilisant ce `provider` depuis le Web Admin.
 *
 * Interface :
 *   available()                    → bool (le fournisseur est-il configuré ?)                       (optionnel)
 *   initiate(payment, method, ctx) → { status: 'pending'|'completed', instructions?, providerReference? }
 *   verify(payment)                → { status: 'completed'|'failed'|'pending', amount?, currency?, providerReference? }
 *                                    Vérification serveur → fournisseur (source de vérité)          (optionnel)
 *   handleWebhook(req)             → { reference } — le statut est ensuite VÉRIFIÉ via verify()     (optionnel)
 */
const flexpay = require('./flexpay');
const { AppError } = require('../../utils/helpers');

/** Demande de recharge : l'entreprise paie selon les modalités communiquées, le Super Administrateur valide. */
const manual = {
  label: 'Demande de recharge (validée par le Super Administrateur)',
  async initiate(payment, method) {
    return {
      status: 'pending',
      instructions:
        (method.instructions || 'Effectuez le paiement puis communiquez la référence au support.') +
        `\n\nRéférence à indiquer : ${payment.reference}\nMontant : ${Number(payment.amount).toFixed(2)} ${payment.currency}`,
    };
  },
};

/** Fournisseur de test : confirmation immédiate. Disponible uniquement pour les tests automatisés. */
const sandbox = {
  label: 'Sandbox (test — confirmation immédiate)',
  async initiate(payment) {
    return { status: 'completed', providerReference: `SBX-${payment.reference}` };
  },
};

const flexpayVerify = async (payment) => {
  if (!payment.providerReference) return { status: 'pending' };
  return flexpay.check(payment.providerReference);
};

// FlexPay envoie { code, reference, provider_reference, orderNumber } : seule la référence est utilisée,
// le statut réel est toujours relu auprès de FlexPay.
const flexpayWebhook = async (req) => ({ reference: req.body?.reference, orderNumber: req.body?.orderNumber });

/** FlexPay Mobile Money (M-Pesa, Orange Money, Airtel Money, Afrimoney). */
const flexpay_mobile = {
  label: 'FlexPay — Mobile Money (confirmation sur le téléphone)',
  online: true,
  needsPhone: true,
  async available() {
    return flexpay.isReady(await flexpay.getConfig());
  },
  async initiate(payment, method, ctx = {}) {
    const phone = flexpay.normalizePhone(ctx.phone);
    if (!phone) throw AppError.badRequest('Numéro Mobile Money invalide (ex. 0812345678)', [{ field: 'phone', message: 'Numéro invalide' }]);
    const r = await flexpay.initiateMobile(payment, phone);
    return {
      status: 'pending',
      providerReference: r.orderNumber,
      payerPhone: phone,
      instructions: `Une demande de paiement de ${Number(payment.amount).toFixed(2)} ${payment.currency} a été envoyée au +${phone}.\nValidez-la sur votre téléphone avec votre code PIN Mobile Money.`,
    };
  },
  verify: flexpayVerify,
  handleWebhook: flexpayWebhook,
};

// Rechargement possible uniquement par Mobile Money (FlexPay) ou par demande validée par l'administrateur.
const registry = { flexpay_mobile, manual };
if (require('../../config').isTest) registry.sandbox = sandbox;

const getProvider = (name) => registry[name] || null;
const listProviders = () =>
  Object.entries(registry).map(([code, p]) => ({ code, label: p.label, webhook: Boolean(p.handleWebhook), online: Boolean(p.online), needsPhone: Boolean(p.needsPhone) }));

/** Le fournisseur est-il utilisable (configuré) ? */
async function isAvailable(name) {
  const p = getProvider(name);
  if (!p) return false;
  return p.available ? p.available() : true;
}

module.exports = { getProvider, listProviders, isAvailable };
