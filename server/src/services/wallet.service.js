/**
 * Wallet des entreprises — grand livre de crédits.
 *
 * Garanties :
 *  - Chaque mouvement est exécuté dans une transaction de base de données.
 *  - La ligne entreprise est verrouillée (SELECT … FOR UPDATE en MySQL, transaction IMMEDIATE en SQLite)
 *    avant lecture/écriture du solde : pas de condition de course.
 *  - Chaque mouvement porte une clé d'idempotence UNIQUE : rejouer la même opération
 *    (double clic, relance du cron, retry réseau) ne débite jamais deux fois.
 *  - Le solde ne peut jamais devenir négatif.
 */
const { Transaction } = require('sequelize');
const { sequelize, Company, CreditTransaction } = require('../models');
const { AppError, makeReference } = require('../utils/helpers');

/** Ouvre une transaction adaptée au dialecte (IMMEDIATE en SQLite pour sérialiser les écritures). */
function withTransaction(fn, outer) {
  if (outer) return fn(outer);
  const opts = sequelize.getDialect() === 'sqlite' ? { type: Transaction.TYPES.IMMEDIATE } : {};
  return sequelize.transaction(opts, fn);
}

/**
 * Applique un mouvement de crédits.
 * @param {object} p
 * @param {number} p.companyId
 * @param {number} p.amount           signé (+ crédit / − débit)
 * @param {string} p.type             topup | publish | renewal | refund | adjustment
 * @param {string} p.idempotencyKey   clé unique de l'opération
 * @returns {{ tx: CreditTransaction, duplicate: boolean }}
 */
async function applyMovement(p, outerTx) {
  const amount = Number(p.amount);
  if (!Number.isInteger(amount) || amount === 0) throw AppError.badRequest('Montant de crédits invalide');
  if (!p.idempotencyKey) throw new Error('idempotencyKey requis');

  return withTransaction(async (t) => {
    // 1. Verrou sur l'entreprise d'abord : les opérations concurrentes sont sérialisées,
    //    et la vérification d'idempotence qui suit voit les écritures déjà validées (MySQL).
    const company = await Company.findByPk(p.companyId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!company) throw AppError.notFound('Entreprise introuvable');

    const existing = await CreditTransaction.findOne({ where: { idempotencyKey: p.idempotencyKey }, transaction: t, lock: t.LOCK.UPDATE });
    if (existing) return { tx: existing, duplicate: true };

    const before = company.walletBalance;
    const after = before + amount;
    if (after < 0) {
      throw AppError.payment(`Solde insuffisant : ${before} crédit(s) disponible(s), ${-amount} requis`);
    }

    company.walletBalance = after;
    await company.save({ transaction: t });

    const tx = await CreditTransaction.create(
      {
        reference: makeReference('TRX'),
        idempotencyKey: p.idempotencyKey,
        companyId: p.companyId,
        type: p.type,
        amount,
        balanceBefore: before,
        balanceAfter: after,
        vehicleId: p.vehicleId || null,
        paymentId: p.paymentId || null,
        description: p.description || null,
        createdById: p.createdById || null,
      },
      { transaction: t }
    );
    return { tx, duplicate: false };
  }, outerTx);
}

const debit = (p, t) => applyMovement({ ...p, amount: -Math.abs(p.amount) }, t);
const credit = (p, t) => applyMovement({ ...p, amount: Math.abs(p.amount) }, t);

module.exports = { applyMovement, debit, credit, withTransaction };
