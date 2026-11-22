/**
 * /api/wallet           — solde, historique des crédits, reçus PDF
 * /api/payments         — rechargements, factures, validation (admin)
 * /api/payment-methods  — moyens de paiement configurables
 */
const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');
const { Company, CreditTransaction, Payment, PaymentMethod, Vehicle } = require('../models');
const { authenticate, backOffice, requirePermission, requireRole, scopeCompanyId, assertOwnership, isSuperAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const payments = require('../services/payment/payment.service');
const { listProviders, getProvider, isAvailable } = require('../services/payment/providers');
const settings = require('../services/settings.service');
const pdf = require('../services/pdf.service');
const audit = require('../services/audit.service');
const { AppError, ah, paginate, paged } = require('../utils/helpers');
const { PERMISSIONS: P, ROLES } = require('../utils/constants');

const dateRange = (q, field = 'createdAt') => {
  const r = {};
  if (q.from) r[Op.gte] = new Date(q.from);
  if (q.to) {
    const to = new Date(q.to);
    to.setHours(23, 59, 59, 999);
    r[Op.lte] = to;
  }
  return Object.getOwnPropertySymbols(r).length ? { [field]: r } : {};
};

const companyInclude = { model: Company, as: 'company', attributes: ['id', 'name'] };

/* =================================================================== */
/* Wallet                                                               */
/* =================================================================== */
const walletRouter = express.Router();
walletRouter.use(authenticate, backOffice, requirePermission(P.WALLET_VIEW));

walletRouter.get(
  '/summary',
  ah(async (req, res) => {
    const companyId = scopeCompanyId(req, req.query.companyId);
    const billing = await settings.get('billing');
    if (!companyId) {
      const balance = await Company.sum('walletBalance');
      return res.json({ data: { balance: Number(balance || 0), billing } });
    }
    const company = await Company.findByPk(companyId);
    if (!company) throw AppError.notFound('Entreprise introuvable');
    const w = { companyId };
    const [topups, spent, refunds, renewals, pendingPayments, autoRenewVehicles] = await Promise.all([
      CreditTransaction.sum('amount', { where: { ...w, type: 'topup' } }),
      CreditTransaction.sum('amount', { where: { ...w, type: { [Op.in]: ['publish', 'renewal'] } } }),
      CreditTransaction.sum('amount', { where: { ...w, type: 'refund' } }),
      CreditTransaction.count({ where: { ...w, type: 'renewal' } }),
      Payment.count({ where: { ...w, status: 'pending' } }),
      Vehicle.count({ where: { ...w, status: 'active', autoRenew: true } }),
    ]);
    res.json({
      data: {
        companyId,
        companyName: company.name,
        balance: company.walletBalance,
        billing,
        totals: { credited: Number(topups || 0), spent: Math.abs(spent || 0) - Number(refunds || 0), renewals, pendingPayments },
        // Crédits nécessaires pour renouveler tous les véhicules en renouvellement automatique
        upcomingRenewalCost: autoRenewVehicles * billing.publishCost,
        publicationsAvailable: Math.floor(company.walletBalance / billing.publishCost),
      },
    });
  })
);

walletRouter.get(
  '/transactions',
  ah(async (req, res) => {
    const pg = paginate(req.query);
    const where = { ...dateRange(req.query) };
    const companyId = scopeCompanyId(req, req.query.companyId);
    if (companyId) where.companyId = companyId;
    if (req.query.type) where.type = String(req.query.type).split(',');
    if (req.query.direction === 'in') where.amount = { [Op.gt]: 0 };
    if (req.query.direction === 'out') where.amount = { [Op.lt]: 0 };
    if (req.query.q) where[Op.or] = [{ reference: { [Op.like]: `%${req.query.q}%` } }, { description: { [Op.like]: `%${req.query.q}%` } }];
    const { rows, count } = await CreditTransaction.findAndCountAll({
      where,
      include: [companyInclude, { model: Vehicle, as: 'vehicle', attributes: ['id', 'brand', 'model', 'year'] }, { model: Payment, as: 'payment', attributes: ['id', 'reference'] }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: pg.limit,
      offset: pg.offset,
    });
    res.json(paged(rows, count, pg));
  })
);

walletRouter.get(
  '/transactions/:id/receipt.pdf',
  ah(async (req, res) => {
    const tx = await CreditTransaction.findByPk(req.params.id, { include: [{ model: Vehicle, as: 'vehicle' }, { model: Payment, as: 'payment' }] });
    assertOwnership(req, tx);
    const company = await Company.findByPk(tx.companyId);
    pdf.send(res, await pdf.transactionReceipt(tx, company), `Recu-${tx.reference}.pdf`, req.query.download === '1');
  })
);

/* =================================================================== */
/* Paiements / rechargements                                           */
/* =================================================================== */
const paymentsRouter = express.Router();

/**
 * Callback des fournisseurs de paiement (non authentifié).
 * Le contenu reçu n'est jamais cru : il sert uniquement à identifier le paiement, dont le statut
 * est ensuite relu auprès du fournisseur (syncPayment → verify).
 */
const WEBHOOK_PROVIDERS = { flexpay: ['flexpay_mobile'] };
paymentsRouter.post(
  '/webhook/:provider',
  ah(async (req, res) => {
    const codes = WEBHOOK_PROVIDERS[req.params.provider] || [req.params.provider];
    const provider = getProvider(codes[0]);
    if (!provider?.handleWebhook) throw AppError.notFound('Fournisseur inconnu');
    const evt = await provider.handleWebhook(req);
    if (!evt.reference) throw AppError.badRequest('Référence manquante');
    const payment = await Payment.findOne({ where: { reference: String(evt.reference) }, include: [{ model: PaymentMethod, as: 'paymentMethod', attributes: ['provider'] }] });
    if (!payment || !codes.includes(payment.paymentMethod?.provider)) throw AppError.notFound('Paiement introuvable');
    if (evt.orderNumber && payment.providerReference && String(evt.orderNumber) !== payment.providerReference) throw AppError.badRequest('Transaction non concordante');
    try {
      const r = await payments.syncPayment(payment.id);
      res.json({ ok: true, status: r.payment.status });
    } catch (e) {
      // Fournisseur momentanément injoignable : la tâche planifiée revérifiera le paiement.
      console.error('[webhook]', req.params.provider, e.message);
      res.status(202).json({ ok: false, retry: true });
    }
  })
);

paymentsRouter.use(authenticate, backOffice);

paymentsRouter.get(
  '/quote',
  requirePermission(P.WALLET_VIEW),
  ah(async (req, res) => res.json({ data: await payments.quote(req.query.packs) }))
);

paymentsRouter.get(
  '/',
  requirePermission(P.WALLET_VIEW),
  ah(async (req, res) => {
    const pg = paginate(req.query);
    const where = { ...dateRange(req.query) };
    const companyId = scopeCompanyId(req, req.query.companyId);
    if (companyId) where.companyId = companyId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.q) where[Op.or] = [{ reference: { [Op.like]: `%${req.query.q}%` } }, { invoiceNumber: { [Op.like]: `%${req.query.q}%` } }, { providerReference: { [Op.like]: `%${req.query.q}%` } }, { operatorReference: { [Op.like]: `%${req.query.q}%` } }];
    const { rows, count } = await Payment.findAndCountAll({ where, include: [companyInclude, { model: PaymentMethod, as: 'paymentMethod', attributes: ['provider'] }], order: [['createdAt', 'DESC']], limit: pg.limit, offset: pg.offset });
    const totalAmount = await Payment.sum('amount', { where: { ...where, status: 'completed' } });
    res.json({ ...paged(rows, count, pg), totals: { completedAmount: Number(totalAmount || 0) } });
  })
);

paymentsRouter.post(
  '/topup',
  requirePermission(P.WALLET_TOPUP),
  validate(
    Joi.object({
      packs: Joi.number().integer().min(1).required(),
      paymentMethodId: Joi.number().integer().required(),
      payerNote: Joi.string().trim().max(255).allow('', null),
      phone: Joi.string().trim().max(30).allow('', null),
      companyId: Joi.number().integer(),
      markAsPaid: Joi.boolean(),
    })
  ),
  ah(async (req, res) => {
    const companyId = isSuperAdmin(req.user) ? req.body.companyId : req.user.companyId;
    if (!companyId) throw AppError.badRequest('Entreprise requise');
    const method = await PaymentMethod.findByPk(req.body.paymentMethodId);
    if (isSuperAdmin(req.user) && getProvider(method?.provider)?.online) {
      throw AppError.badRequest('Les paiements en ligne (FlexPay) sont initiés par l’entreprise depuis son wallet');
    }
    const result = await payments.createTopup({ ...req.body, companyId }, req);
    // Le super admin peut enregistrer directement un paiement reçu (espèces, virement…)
    if (isSuperAdmin(req.user) && req.body.markAsPaid && result.payment.status === 'pending') {
      const done = await payments.completePayment(result.payment.id, { adminNote: 'Paiement enregistré par l’administrateur' }, req);
      return res.status(201).json({ data: done.payment, balance: done.balance });
    }
    res.status(201).json({ data: result.payment, instructions: result.instructions, balance: result.balance, online: result.online });
  })
);

const loadPayment = async (req) => assertOwnership(req, await Payment.findByPk(req.params.id, { include: [companyInclude] }));

paymentsRouter.get(
  '/:id',
  requirePermission(P.WALLET_VIEW),
  ah(async (req, res) => res.json({ data: await loadPayment(req) }))
);

const paymentPdf = (kind) =>
  ah(async (req, res) => {
    const payment = await loadPayment(req);
    if (kind === 'receipt' && payment.status !== 'completed') throw AppError.badRequest('Le reçu est disponible une fois le paiement confirmé');
    const company = await Company.findByPk(payment.companyId);
    const doc = await pdf.paymentDocument(payment, company, kind);
    const name = kind === 'invoice' ? `Facture-${payment.invoiceNumber}.pdf` : `Recu-${payment.reference}.pdf`;
    pdf.send(res, doc, name, req.query.download === '1');
  });
paymentsRouter.get('/:id/invoice.pdf', requirePermission(P.WALLET_VIEW), paymentPdf('invoice'));
paymentsRouter.get('/:id/receipt.pdf', requirePermission(P.WALLET_VIEW), paymentPdf('receipt'));

/** Vérifie un paiement en ligne auprès du fournisseur (suivi en direct, bouton « Vérifier »). */
paymentsRouter.post(
  '/:id/refresh',
  requirePermission(P.WALLET_VIEW),
  ah(async (req, res) => {
    const payment = await loadPayment(req);
    const r = await payments.syncPayment(payment.id, req);
    const company = await Company.findByPk(payment.companyId, { attributes: ['walletBalance'] });
    res.json({ data: r.payment, changed: r.changed, anomaly: Boolean(r.anomaly), balance: company.walletBalance });
  })
);

paymentsRouter.post(
  '/:id/confirm',
  requireRole(ROLES.SUPER_ADMIN),
  validate(Joi.object({ adminNote: Joi.string().trim().max(255).allow('', null) })),
  ah(async (req, res) => {
    const r = await payments.completePayment(Number(req.params.id), req.body, req);
    res.json({ data: r.payment, balance: r.balance, already: Boolean(r.already) });
  })
);

paymentsRouter.post(
  '/:id/reject',
  requireRole(ROLES.SUPER_ADMIN),
  validate(Joi.object({ adminNote: Joi.string().trim().max(255).allow('', null) })),
  ah(async (req, res) => res.json({ data: await payments.closePayment(Number(req.params.id), 'failed', req.body.adminNote, req) }))
);

paymentsRouter.post(
  '/:id/cancel',
  requirePermission(P.WALLET_TOPUP),
  ah(async (req, res) => {
    await loadPayment(req);
    res.json({ data: await payments.closePayment(Number(req.params.id), 'cancelled', 'Annulé par le demandeur', req) });
  })
);

/* =================================================================== */
/* Moyens de paiement                                                   */
/* =================================================================== */
const methodsRouter = express.Router();
methodsRouter.use(authenticate, backOffice);

const methodFields = {
  code: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]+$/).max(50),
  name: Joi.string().trim().min(2).max(100),
  provider: Joi.string().valid(...listProviders().map((p) => p.code)),
  instructions: Joi.string().trim().max(2000).allow('', null),
  icon: Joi.string().trim().max(60).allow('', null),
  active: Joi.boolean(),
  sortOrder: Joi.number().integer(),
};

methodsRouter.get(
  '/',
  ah(async (req, res) => {
    const all = isSuperAdmin(req.user) && req.query.all === '1';
    const rows = await PaymentMethod.findAll({ where: all ? {} : { active: true }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] });
    const data = [];
    for (const m of rows) {
      const p = getProvider(m.provider);
      const available = await isAvailable(m.provider);
      // Un moyen en ligne non configuré n'est pas proposé aux entreprises.
      if (!all && !available) continue;
      data.push({ ...m.toJSON(), available, online: Boolean(p?.online), needsPhone: Boolean(p?.needsPhone) });
    }
    res.json({ data });
  })
);

methodsRouter.get('/providers', requireRole(ROLES.SUPER_ADMIN), (req, res) => res.json({ data: listProviders() }));

methodsRouter.post(
  '/',
  requireRole(ROLES.SUPER_ADMIN),
  validate(Joi.object({ ...methodFields, code: methodFields.code.required(), name: methodFields.name.required(), provider: methodFields.provider.required() })),
  ah(async (req, res) => {
    const m = await PaymentMethod.create(req.body);
    audit.log(req, 'payment_method.create', { entityType: 'payment_method', entityId: m.id, description: `Moyen de paiement ${m.name}` });
    res.status(201).json({ data: m });
  })
);

methodsRouter.patch(
  '/:id',
  requireRole(ROLES.SUPER_ADMIN),
  validate(Joi.object(methodFields)),
  ah(async (req, res) => {
    const m = await PaymentMethod.findByPk(req.params.id);
    if (!m) throw AppError.notFound();
    await m.update(req.body);
    audit.log(req, 'payment_method.update', { entityType: 'payment_method', entityId: m.id, description: `Modification ${m.name}` });
    res.json({ data: m });
  })
);

methodsRouter.delete(
  '/:id',
  requireRole(ROLES.SUPER_ADMIN),
  ah(async (req, res) => {
    const m = await PaymentMethod.findByPk(req.params.id);
    if (!m) throw AppError.notFound();
    if (await Payment.count({ where: { paymentMethodId: m.id } })) throw AppError.conflict('Ce moyen de paiement est utilisé par des transactions : désactivez-le plutôt');
    await m.destroy();
    audit.log(req, 'payment_method.delete', { entityType: 'payment_method', entityId: m.id, description: `Suppression ${m.name}` });
    res.json({ ok: true });
  })
);

module.exports = { walletRouter, paymentsRouter, methodsRouter, dateRange };
