/**
 * Logique métier des véhicules : complétude, publication payante, validation,
 * suspension, renouvellement automatique et expiration.
 */
const { Op } = require('sequelize');
const { Vehicle, VehicleMedia, VehicleEvent, Company, Category, Feature, CreditTransaction, User } = require('../models');
const settings = require('./settings.service');
const wallet = require('./wallet.service');
const email = require('./email.service');
const audit = require('./audit.service');
const config = require('../config');
const { AppError, addMonths, mediaUrl } = require('../utils/helpers');
const { VEHICLE_STATUS: S, ROLES } = require('../utils/constants');

/* ------------------------------------------------------------------ */
/* Sérialisation                                                       */
/* ------------------------------------------------------------------ */
const num = (v) => (v === null || v === undefined ? null : Number(v));

function serialize(v, { forPublic = false } = {}) {
  const j = v.toJSON ? v.toJSON() : v;
  const media = (j.media || []).slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const photos = media.filter((m) => m.type === 'photo').map((m) => ({ id: m.id, url: mediaUrl(m.path), thumbUrl: mediaUrl(m.thumbPath), width: m.width, height: m.height, sortOrder: m.sortOrder }));
  const video = media.find((m) => m.type === 'video');
  const out = {
    id: j.id,
    companyId: j.companyId,
    categoryId: j.categoryId,
    category: j.category ? { id: j.category.id, name: j.category.name, slug: j.category.slug, icon: j.category.icon } : null,
    brand: j.brand,
    model: j.model,
    title: `${j.brand} ${j.model}`,
    year: j.year,
    fuelType: j.fuelType,
    transmission: j.transmission,
    seats: j.seats,
    doors: j.doors,
    color: j.color,
    mileage: j.mileage,
    city: j.city,
    address: j.address,
    priceDaily: num(j.priceDaily),
    priceWeekly: num(j.priceWeekly),
    priceMonthly: num(j.priceMonthly),
    currency: j.currency,
    driverMode: j.driverMode || 'none',
    withDriver: j.withDriver,
    driverPriceDaily: num(j.driverPriceDaily),
    driverPriceWeekly: num(j.driverPriceWeekly),
    driverPriceMonthly: num(j.driverPriceMonthly),
    description: j.description,
    rentalConditions: j.rentalConditions,
    availability: j.availability,
    features: (j.features || []).map((f) => ({ id: f.id, name: f.name, slug: f.slug, icon: f.icon })),
    photos,
    coverUrl: photos[0]?.url || null,
    coverThumbUrl: photos[0]?.thumbUrl || null,
    video: video ? { id: video.id, url: mediaUrl(video.path), sizeBytes: video.sizeBytes, mimeType: video.mimeType } : null,
    viewsCount: j.viewsCount,
    contactsCount: j.contactsCount,
    publishedAt: j.publishedAt,
    createdAt: j.createdAt,
  };
  if (j.company) {
    out.company = {
      id: j.company.id,
      name: j.company.name,
      logoUrl: mediaUrl(j.company.logoUrl),
      phone: j.company.phone,
      whatsapp: j.company.whatsapp || j.company.phone,
      email: j.company.email,
      city: j.company.city,
      address: j.company.address,
    };
  }
  if (!forPublic) {
    Object.assign(out, {
      plateNumber: j.plateNumber,
      status: j.status,
      statusReason: j.statusReason,
      expiresAt: j.expiresAt,
      autoRenew: j.autoRenew,
      publicationCount: j.publicationCount,
      updatedAt: j.updatedAt,
      completeness: completeness(j),
    });
  } else {
    // L'immatriculation n'est jamais exposée publiquement.
    out.plateMasked = j.plateNumber ? `${String(j.plateNumber).slice(0, 2)}•••` : null;
  }
  return out;
}

const fullInclude = [
  { model: VehicleMedia, as: 'media' },
  { model: Category, as: 'category' },
  { model: Feature, as: 'features', through: { attributes: [] } },
  { model: Company, as: 'company' },
];

/* ------------------------------------------------------------------ */
/* Complétude                                                          */
/* ------------------------------------------------------------------ */
const REQUIRED = {
  brand: 'Marque',
  model: 'Modèle',
  year: 'Année de fabrication',
  categoryId: 'Catégorie',
  fuelType: 'Type de carburant',
  transmission: 'Transmission',
  seats: 'Nombre de places',
  doors: 'Nombre de portes',
  color: 'Couleur',
  plateNumber: 'Immatriculation',
  city: 'Localisation (ville)',
  description: 'Description',
  rentalConditions: 'Conditions de location',
};

function completeness(v) {
  const missing = Object.entries(REQUIRED)
    .filter(([k]) => v[k] === null || v[k] === undefined || v[k] === '')
    .map(([, label]) => label);
  if (!v.priceDaily && !v.priceWeekly && !v.priceMonthly) missing.push('Au moins un prix (journalier, hebdomadaire ou mensuel)');
  if (v.driverMode === 'optional' && (v.driverPriceDaily === null || v.driverPriceDaily === undefined || v.driverPriceDaily === ''))
    missing.push('Supplément chauffeur par jour (chauffeur en option)');
  const photos = (v.media || []).filter((m) => m.type === 'photo').length;
  if (photos < config.media.minPhotos) missing.push(`${config.media.minPhotos} photos minimum (${photos}/${config.media.minPhotos})`);
  const total = Object.keys(REQUIRED).length + 2 + (v.driverMode === 'optional' ? 1 : 0);
  return { ready: missing.length === 0, missing, photos, percent: Math.round(((total - missing.length) / total) * 100) };
}

/* ------------------------------------------------------------------ */
/* Publication                                                         */
/* ------------------------------------------------------------------ */
const companyRecipients = async (companyId) => {
  const company = await Company.findByPk(companyId);
  const admins = await User.findAll({ where: { companyId, role: ROLES.COMPANY_ADMIN, status: 'active' }, attributes: ['email'] });
  const list = new Set([company?.email, ...admins.map((a) => a.email)].filter(Boolean));
  return { company, to: [...list].join(',') };
};

async function publish(vehicleId, req) {
  const billing = await settings.get('billing');
  const general = await settings.get('general');
  const cost = billing.publishCost;

  const result = await wallet.withTransaction(async (t) => {
    const v = await Vehicle.findByPk(vehicleId, { include: [{ model: VehicleMedia, as: 'media' }], transaction: t, lock: t.LOCK.UPDATE });
    if (!v) throw AppError.notFound('Véhicule introuvable');
    if (![S.DRAFT, S.EXPIRED, S.REJECTED].includes(v.status)) {
      throw AppError.conflict(v.status === S.SUSPENDED ? 'Véhicule suspendu par l’administration' : 'Ce véhicule est déjà publié');
    }
    const c = completeness(v);
    if (!c.ready) throw AppError.badRequest('Le véhicule est incomplet et ne peut pas être publié', c.missing.map((m) => ({ field: 'vehicle', message: m })));

    const nextCount = v.publicationCount + 1;
    const { tx } = await wallet.debit(
      {
        companyId: v.companyId,
        amount: cost,
        type: 'publish',
        idempotencyKey: `publish:${v.id}:${nextCount}`,
        vehicleId: v.id,
        description: `Publication ${v.brand} ${v.model} (${billing.validityMonths} mois)`,
        createdById: req?.user?.id,
      },
      t
    );

    const now = new Date();
    const pending = Boolean(general.requireVehicleApproval);
    await v.update(
      {
        status: pending ? S.PENDING : S.ACTIVE,
        statusReason: null,
        publishedAt: now,
        expiresAt: addMonths(now, billing.validityMonths),
        lastReminderDays: null,
        expiryReminderSentAt: null,
        publicationCount: nextCount,
      },
      { transaction: t }
    );
    await VehicleEvent.create({ vehicleId: v.id, companyId: v.companyId, type: 'published', details: `${cost} crédits débités (${tx.reference})` }, { transaction: t });
    return { v, tx, pending };
  });

  const { v, tx, pending } = result;
  audit.log(req, 'vehicle.publish', { entityType: 'vehicle', entityId: v.id, companyId: v.companyId, description: `Publication ${v.brand} ${v.model} — ${cost} crédits`, metadata: { transaction: tx.reference } });
  const { company, to } = await companyRecipients(v.companyId);
  email.queue('vehiclePublished', to, { vehicle: v, company, cost, balance: tx.balanceAfter, pending }, { companyId: v.companyId });
  return { vehicle: v, transaction: tx, pending };
}

/* ------------------------------------------------------------------ */
/* Modération (super admin)                                            */
/* ------------------------------------------------------------------ */
async function moderate(vehicleId, action, reason, req) {
  const billing = await settings.get('billing');
  const v = await wallet.withTransaction(async (t) => {
    const veh = await Vehicle.findByPk(vehicleId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!veh) throw AppError.notFound('Véhicule introuvable');
    const now = new Date();

    if (action === 'approve') {
      if (veh.status !== S.PENDING) throw AppError.conflict('Seuls les véhicules en attente peuvent être validés');
      // La validité court à partir de la validation.
      await veh.update({ status: S.ACTIVE, statusReason: null, publishedAt: now, expiresAt: addMonths(now, billing.validityMonths) }, { transaction: t });
      await VehicleEvent.create({ vehicleId: veh.id, companyId: veh.companyId, type: 'approved' }, { transaction: t });
    } else if (action === 'reject') {
      if (veh.status !== S.PENDING) throw AppError.conflict('Seuls les véhicules en attente peuvent être refusés');
      const publishTx = await CreditTransaction.findOne({ where: { idempotencyKey: `publish:${veh.id}:${veh.publicationCount}` }, transaction: t });
      if (publishTx) {
        await wallet.credit(
          { companyId: veh.companyId, amount: Math.abs(publishTx.amount), type: 'refund', idempotencyKey: `refund:${publishTx.id}`, vehicleId: veh.id, description: `Remboursement — publication refusée ${veh.brand} ${veh.model}`, createdById: req.user.id },
          t
        );
      }
      await veh.update({ status: S.REJECTED, statusReason: reason || null, expiresAt: null }, { transaction: t });
      await VehicleEvent.create({ vehicleId: veh.id, companyId: veh.companyId, type: 'rejected', details: reason }, { transaction: t });
    } else if (action === 'suspend') {
      if (veh.status === S.SUSPENDED) throw AppError.conflict('Véhicule déjà suspendu');
      await veh.update({ status: S.SUSPENDED, statusReason: reason || null }, { transaction: t });
      await VehicleEvent.create({ vehicleId: veh.id, companyId: veh.companyId, type: 'suspended', details: reason }, { transaction: t });
    } else if (action === 'reactivate') {
      if (veh.status !== S.SUSPENDED) throw AppError.conflict('Le véhicule n’est pas suspendu');
      const stillValid = veh.expiresAt && new Date(veh.expiresAt) > now;
      await veh.update({ status: stillValid ? S.ACTIVE : veh.publishedAt ? S.EXPIRED : S.DRAFT, statusReason: null }, { transaction: t });
      await VehicleEvent.create({ vehicleId: veh.id, companyId: veh.companyId, type: 'reactivated' }, { transaction: t });
    } else {
      throw AppError.badRequest('Action inconnue');
    }
    return veh;
  });

  audit.log(req, `vehicle.${action}`, { entityType: 'vehicle', entityId: v.id, companyId: v.companyId, description: `${action} ${v.brand} ${v.model}${reason ? ` — ${reason}` : ''}` });
  const { to } = await companyRecipients(v.companyId);
  email.queue('vehicleStatus', to, { vehicle: v, status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'suspend' ? 'suspended' : 'reactivated', reason }, { companyId: v.companyId });
  return v;
}

/* ------------------------------------------------------------------ */
/* Tâches automatiques : rappels, renouvellement, expiration           */
/* ------------------------------------------------------------------ */
const DAY = 86400000;

async function sendExpiryReminders(now = new Date()) {
  const billing = await settings.get('billing');
  const thresholds = [...(billing.reminderDays || [])].map(Number).filter((n) => n > 0).sort((a, b) => b - a);
  if (!thresholds.length) return 0;
  const vehicles = await Vehicle.findAll({
    where: { status: S.ACTIVE, expiresAt: { [Op.gt]: now, [Op.lte]: new Date(now.getTime() + thresholds[0] * DAY) } },
    include: [{ model: Company, as: 'company' }],
  });
  let sent = 0;
  for (const v of vehicles) {
    const daysLeft = Math.ceil((new Date(v.expiresAt) - now) / DAY);
    // Plus petit palier ≥ jours restants (ex. 30 puis 7)
    const stage = thresholds.filter((d) => d >= daysLeft).pop();
    if (!stage || (v.lastReminderDays && v.lastReminderDays <= stage)) continue;
    await v.update({ lastReminderDays: stage, expiryReminderSentAt: now });
    await VehicleEvent.create({ vehicleId: v.id, companyId: v.companyId, type: 'reminder', details: `Expiration dans ${daysLeft} jour(s)` });
    const { to } = await companyRecipients(v.companyId);
    email.queue('expiryReminder', to, { vehicle: v, days: daysLeft, balance: v.company.walletBalance, cost: billing.publishCost, autoRenew: v.autoRenew }, { companyId: v.companyId });
    sent++;
  }
  return sent;
}

/** Traite un véhicule arrivé à échéance : renouvellement si possible, sinon désactivation. */
async function processExpiredVehicle(vehicleId, now = new Date()) {
  const billing = await settings.get('billing');
  const cost = billing.publishCost;

  const outcome = await wallet.withTransaction(async (t) => {
    const v = await Vehicle.findByPk(vehicleId, { include: [{ model: Company, as: 'company' }], transaction: t, lock: t.LOCK.UPDATE });
    // Re-vérification sous verrou : un autre worker a pu traiter ce véhicule entre-temps.
    if (!v || v.status !== S.ACTIVE || !v.expiresAt || new Date(v.expiresAt) > now) return { skipped: true };

    const companyActive = v.company?.status === 'active';
    if (v.autoRenew && companyActive) {
      try {
        // Clé = véhicule + date d'échéance : un même cycle ne peut être débité qu'une seule fois.
        const { tx } = await wallet.debit(
          {
            companyId: v.companyId,
            amount: cost,
            type: 'renewal',
            idempotencyKey: `renewal:${v.id}:${new Date(v.expiresAt).toISOString()}`,
            vehicleId: v.id,
            description: `Renouvellement automatique ${v.brand} ${v.model} (${billing.validityMonths} mois)`,
          },
          t
        );
        let next = addMonths(v.expiresAt, billing.validityMonths);
        if (next <= now) next = addMonths(now, billing.validityMonths);
        await v.update({ expiresAt: next, lastReminderDays: null, expiryReminderSentAt: null }, { transaction: t });
        await VehicleEvent.create({ vehicleId: v.id, companyId: v.companyId, type: 'renewed', details: `${cost} crédits débités (${tx.reference})` }, { transaction: t });
        return { renewed: true, v, tx };
      } catch (e) {
        if (e.code !== 'INSUFFICIENT_CREDITS') throw e;
        await v.update({ status: S.EXPIRED, statusReason: 'Solde insuffisant pour le renouvellement' }, { transaction: t });
        await VehicleEvent.create({ vehicleId: v.id, companyId: v.companyId, type: 'renewal_failed', details: `Solde ${v.company.walletBalance} < ${cost}` }, { transaction: t });
        await VehicleEvent.create({ vehicleId: v.id, companyId: v.companyId, type: 'expired' }, { transaction: t });
        return { expired: true, reason: 'insufficient', v, balance: v.company.walletBalance };
      }
    }
    await v.update({ status: S.EXPIRED, statusReason: v.autoRenew ? 'Entreprise suspendue' : 'Renouvellement automatique désactivé' }, { transaction: t });
    await VehicleEvent.create({ vehicleId: v.id, companyId: v.companyId, type: 'expired' }, { transaction: t });
    return { expired: true, reason: v.autoRenew ? 'company_suspended' : 'disabled', v, balance: v.company?.walletBalance };
  });

  if (outcome.skipped) return outcome;
  const { v } = outcome;
  const { to } = await companyRecipients(v.companyId);
  if (outcome.renewed) {
    audit.log(null, 'vehicle.auto_renew', { entityType: 'vehicle', entityId: v.id, companyId: v.companyId, description: `Renouvellement automatique — ${cost} crédits`, metadata: { transaction: outcome.tx.reference } });
    email.queue('vehicleRenewed', to, { vehicle: v, cost, balance: outcome.tx.balanceAfter }, { companyId: v.companyId });
  } else {
    audit.log(null, 'vehicle.expired', { entityType: 'vehicle', entityId: v.id, companyId: v.companyId, description: `Véhicule désactivé (${outcome.reason})` });
    if (outcome.reason !== 'company_suspended') {
      email.queue('vehicleExpired', to, { vehicle: v, balance: outcome.balance, cost, reason: outcome.reason }, { companyId: v.companyId });
    }
  }
  return outcome;
}

async function processExpirations(now = new Date()) {
  const due = await Vehicle.findAll({ where: { status: S.ACTIVE, expiresAt: { [Op.lte]: now } }, attributes: ['id'], order: [['expiresAt', 'ASC']] });
  const stats = { processed: 0, renewed: 0, expired: 0, errors: 0 };
  for (const { id } of due) {
    try {
      const r = await processExpiredVehicle(id, now);
      if (r.skipped) continue;
      stats.processed++;
      if (r.renewed) stats.renewed++;
      if (r.expired) stats.expired++;
    } catch (e) {
      stats.errors++;
      console.error('[jobs] véhicule', id, e.message);
    }
  }
  return stats;
}

/** Filtre « visible publiquement » : actif, non expiré, entreprise active. */
const publicWhere = () => ({ status: S.ACTIVE, expiresAt: { [Op.gt]: new Date() } });

module.exports = { serialize, fullInclude, completeness, publish, moderate, sendExpiryReminders, processExpiredVehicle, processExpirations, publicWhere, companyRecipients };
