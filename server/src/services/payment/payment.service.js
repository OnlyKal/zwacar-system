/**
 * Rechargement du wallet : création, confirmation, échec et annulation des paiements.
 * La conversion USD → crédits suit la grille définie par le Super Administrateur
 * (par défaut 15 USD = 20 crédits).
 */
const { Op } = require('sequelize');
const { Payment, PaymentMethod, Company } = require('../../models');
const { getProvider, isAvailable } = require('./providers');
const settings = require('../settings.service');
const wallet = require('../wallet.service');
const email = require('../email.service');
const audit = require('../audit.service');
const pdf = require('../pdf.service');
const notifications = require('../notification.service');
const { ROLES } = require('../../utils/constants');
const { AppError, makeReference } = require('../../utils/helpers');

/** Taux de remise applicable à un nombre de packs (palier le plus élevé atteint). */
function discountFor(billing, packs) {
  const tiers = (billing.volumeDiscounts || []).filter((t) => packs >= Number(t.minPacks));
  return tiers.reduce((best, t) => Math.max(best, Number(t.percent)), 0);
}

async function quote(packs) {
  const billing = await settings.get('billing');
  const n = Number(packs);
  if (!Number.isInteger(n) || n < billing.minTopupPacks || n > billing.maxTopupPacks) {
    throw AppError.badRequest(`Nombre de packs invalide (${billing.minTopupPacks} à ${billing.maxTopupPacks})`);
  }
  const grossAmount = +(n * billing.packPriceUsd).toFixed(2);
  const discountPercent = discountFor(billing, n);
  const amount = +(grossAmount * (1 - discountPercent / 100)).toFixed(2);
  return { packs: n, grossAmount, discountPercent, discountAmount: +(grossAmount - amount).toFixed(2), amount, credits: n * billing.packCredits, currency: 'USD' };
}

/**
 * Crée une demande de rechargement et la transmet au fournisseur.
 * `phone` : numéro du payeur pour le Mobile Money en ligne.
 */
async function createTopup({ companyId, packs, paymentMethodId, payerNote, phone }, req) {
  const company = await Company.findByPk(companyId);
  if (!company) throw AppError.notFound('Entreprise introuvable');
  if (company.status !== 'active') throw AppError.forbidden('Entreprise suspendue');

  const method = await PaymentMethod.findOne({ where: { id: paymentMethodId, active: true } });
  if (!method) throw AppError.badRequest('Moyen de paiement indisponible');
  const provider = getProvider(method.provider);
  if (!provider) throw AppError.badRequest('Fournisseur de paiement non pris en charge');
  if (!(await isAvailable(method.provider))) throw AppError.badRequest('Ce moyen de paiement n’est pas encore configuré');
  if (provider.needsPhone && !require('./flexpay').normalizePhone(phone)) {
    throw AppError.badRequest('Numéro Mobile Money invalide (ex. 0812345678)', [{ field: 'phone', message: 'Numéro invalide' }]);
  }

  const q = await quote(packs);
  const payment = await Payment.create({
    reference: makeReference('PAY'),
    invoiceNumber: makeReference('INV'),
    companyId,
    paymentMethodId: method.id,
    methodName: method.name,
    amount: q.amount,
    grossAmount: q.grossAmount,
    discountPercent: q.discountPercent,
    currency: q.currency,
    credits: q.credits,
    status: 'pending',
    payerNote: payerNote || null,
    createdById: req?.user?.id,
  });
  audit.log(req, 'payment.create', { entityType: 'payment', entityId: payment.id, companyId, description: `Demande de rechargement ${payment.reference} — ${q.amount} USD / ${q.credits} crédits` });

  let init;
  try {
    init = await provider.initiate(payment, method, { phone });
  } catch (e) {
    // Demande refusée par le fournisseur : le paiement est clôturé, rien n'a été débité.
    await payment.update({ status: 'failed', failureReason: String(e.message).slice(0, 255) });
    audit.log(req, 'payment.initiate_failed', { entityType: 'payment', entityId: payment.id, companyId, description: `Échec de l’envoi ${payment.reference} : ${e.message}` });
    throw e;
  }
  const patch = {};
  if (init.providerReference) patch.providerReference = init.providerReference;
  if (init.payerPhone) patch.payerPhone = init.payerPhone;
  if (Object.keys(patch).length) await payment.update(patch);

  if (init.status === 'completed') {
    const done = await completePayment(payment.id, { auto: true }, req);
    return { payment: done.payment, balance: done.balance, instructions: null };
  }
  // Demande de recharge : instructions envoyées par email à l'entreprise et demande signalée au Super Administrateur.
  if (!provider.online) {
    email.queue('topupRequested', company.email, { company, payment, instructions: init.instructions }, { companyId });
    if (req?.user?.role !== ROLES.SUPER_ADMIN && init.status !== 'completed') {
      await notifications.notifySuperAdmins({
        type: 'topup.requested',
        title: 'Nouvelle demande de recharge',
        message: `${company.name} demande ${payment.credits} crédits (${Number(payment.amount).toFixed(2)} ${payment.currency}) — référence ${payment.reference}. À valider après réception du paiement.`,
        link: '/admin/payments?status=pending',
        companyId,
        dedupeKey: `topup.requested:${payment.id}`,
      });
    }
  }
  return { payment, instructions: init.instructions, online: Boolean(provider.online) };
}

/**
 * Confirme un paiement et crédite le wallet (idempotent : `topup:<paymentId>`).
 * La référence de transaction est générée automatiquement si le fournisseur n'en a pas fourni.
 */
async function completePayment(paymentId, { operatorReference, adminNote, auto } = {}, req) {
  const result = await wallet.withTransaction(async (t) => {
    const payment = await Payment.findByPk(paymentId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!payment) throw AppError.notFound('Paiement introuvable');
    if (payment.status === 'completed') return { payment, already: true };
    if (payment.status !== 'pending') throw AppError.conflict(`Paiement ${payment.status === 'failed' ? 'échoué' : 'annulé'} : confirmation impossible`);

    const { tx } = await wallet.credit(
      {
        companyId: payment.companyId,
        amount: payment.credits,
        type: 'topup',
        idempotencyKey: `topup:${payment.id}`,
        paymentId: payment.id,
        description: `Rechargement ${payment.reference} — ${Number(payment.amount).toFixed(2)} ${payment.currency}`,
        createdById: req?.user?.id,
      },
      t
    );
    await payment.update(
      {
        status: 'completed',
        paidAt: new Date(),
        processedById: auto ? null : req?.user?.id,
        providerReference: payment.providerReference || makeReference('TRX'),
        operatorReference: operatorReference || payment.operatorReference,
        adminNote: adminNote || payment.adminNote,
      },
      { transaction: t }
    );
    return { payment, balance: tx.balanceAfter };
  });

  if (!result.already) {
    const company = await Company.findByPk(result.payment.companyId);
    // Paiement Mobile Money confirmé automatiquement (vérifié auprès de FlexPay) : confirmation au Super Administrateur.
    const method = result.payment.paymentMethodId ? await PaymentMethod.findByPk(result.payment.paymentMethodId) : null;
    if (auto && getProvider(method?.provider)?.online) {
      await notifications.notifySuperAdmins({
        type: 'topup.completed',
        title: 'Paiement Mobile Money confirmé',
        message: `${company.name} a payé ${Number(result.payment.amount).toFixed(2)} ${result.payment.currency} par Mobile Money : +${result.payment.credits} crédits ajoutés, nouveau solde ${result.balance} crédits. Référence ${result.payment.reference}.`,
        link: '/admin/payments?status=completed',
        companyId: company.id,
        dedupeKey: `topup.completed:${result.payment.id}`,
      });
    }
    audit.log(req, 'payment.complete', { entityType: 'payment', entityId: result.payment.id, companyId: company.id, description: `Rechargement confirmé ${result.payment.reference} : +${result.payment.credits} crédits` });
    // Envoi automatique de la facture et du reçu en pièces jointes.
    setImmediate(async () => {
      try {
        const [invoice, receipt] = await Promise.all([pdf.toBuffer(await pdf.paymentDocument(result.payment, company, 'invoice')), pdf.toBuffer(await pdf.paymentDocument(result.payment, company, 'receipt'))]);
        await email.send(
          'topupConfirmed',
          company.email,
          { company, payment: result.payment, balance: result.balance },
          {
            companyId: company.id,
            attachments: [
              { filename: `Facture-${result.payment.invoiceNumber}.pdf`, content: invoice },
              { filename: `Recu-${result.payment.reference}.pdf`, content: receipt },
            ],
          }
        );
      } catch (e) {
        console.error('[payment] email de confirmation', e.message);
      }
    });
  }
  return result;
}

async function closePayment(paymentId, status, adminNote, req) {
  const payment = await Payment.findByPk(paymentId);
  if (!payment) throw AppError.notFound('Paiement introuvable');
  if (payment.status !== 'pending') throw AppError.conflict('Seuls les paiements en attente peuvent être modifiés');
  await payment.update({ status, adminNote: adminNote || null, processedById: req.user.id });
  audit.log(req, `payment.${status}`, { entityType: 'payment', entityId: payment.id, companyId: payment.companyId, description: `Paiement ${payment.reference} ${status === 'failed' ? 'rejeté' : 'annulé'}` });
  return payment;
}

/**
 * Synchronise un paiement en ligne avec son fournisseur (source de vérité).
 * Appelé par le callback, le bouton « Vérifier », le suivi en direct et la tâche planifiée.
 * Crédit unique garanti par completePayment (verrou + clé d'idempotence `topup:<id>`).
 */
async function syncPayment(paymentId, req) {
  const payment = await Payment.findByPk(paymentId);
  if (!payment) throw AppError.notFound('Paiement introuvable');
  if (payment.status !== 'pending') return { payment, changed: false };
  const method = payment.paymentMethodId ? await PaymentMethod.findByPk(payment.paymentMethodId) : null;
  const provider = getProvider(method?.provider);
  if (!provider?.verify) return { payment, changed: false };

  const v = await provider.verify(payment);
  if (v.status === 'completed') {
    // Contrôle anti-fraude : montant et devise confirmés par le fournisseur.
    const amountOk = Number.isFinite(v.amount) && Math.abs(v.amount - Number(payment.amount)) < 0.01;
    const currencyOk = !v.currency || String(v.currency).toUpperCase() === payment.currency;
    if (!amountOk || !currencyOk) {
      const reason = `Écart fournisseur : ${v.amount} ${v.currency} au lieu de ${Number(payment.amount).toFixed(2)} ${payment.currency}`;
      if (payment.failureReason !== reason) {
        await payment.update({ failureReason: reason });
        audit.log(req, 'payment.anomaly', { entityType: 'payment', entityId: payment.id, companyId: payment.companyId, description: `${payment.reference} — ${reason} (vérification manuelle requise)` });
      }
      return { payment, changed: false, anomaly: true };
    }
    const r = await completePayment(payment.id, { auto: true, operatorReference: v.providerReference || null }, req);
    return { payment: r.payment, balance: r.balance, changed: !r.already };
  }
  if (v.status === 'failed') {
    const [n] = await Payment.update({ status: 'failed', failureReason: 'Paiement refusé ou annulé chez l’opérateur' }, { where: { id: payment.id, status: 'pending' } });
    if (n) audit.log(req, 'payment.failed', { entityType: 'payment', entityId: payment.id, companyId: payment.companyId, description: `Paiement ${payment.reference} refusé par le fournisseur` });
    return { payment: await payment.reload(), changed: Boolean(n) };
  }
  return { payment, changed: false };
}

const ONLINE_EXPIRY_HOURS = 48;

/** Tâche planifiée : vérifie les paiements en ligne en attente et clôture ceux qui ont expiré. */
async function syncPendingOnline() {
  const online = (await PaymentMethod.findAll({ attributes: ['id', 'provider'] })).filter((m) => getProvider(m.provider)?.verify).map((m) => m.id);
  if (!online.length) return { checked: 0, completed: 0, failed: 0, expired: 0 };
  const pending = await Payment.findAll({ where: { status: 'pending', paymentMethodId: online }, order: [['createdAt', 'ASC']], limit: 100 });
  const out = { checked: 0, completed: 0, failed: 0, expired: 0 };
  for (const p of pending) {
    try {
      const r = await syncPayment(p.id);
      out.checked++;
      if (r.changed && r.payment.status === 'completed') out.completed++;
      else if (r.changed && r.payment.status === 'failed') out.failed++;
      else if (!r.anomaly && p.createdAt < new Date(Date.now() - ONLINE_EXPIRY_HOURS * 3600000)) {
        const [n] = await Payment.update({ status: 'failed', failureReason: `Non confirmé après ${ONLINE_EXPIRY_HOURS} h` }, { where: { id: p.id, status: 'pending' } });
        if (n) out.expired++;
      }
    } catch (e) {
      console.error(`[payments] synchronisation ${p.reference}`, e.message);
    }
  }
  return out;
}

module.exports = { discountFor, quote, createTopup, completePayment, closePayment, syncPayment, syncPendingOnline };
