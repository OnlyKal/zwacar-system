/**
 * /api/companies — gestion des entreprises (Super Administrateur)
 * /api/company   — espace de l'entreprise connectée (profil, logo)
 */
const express = require('express');
const Joi = require('joi');
const { Op } = require('sequelize');
const models = require('../models');
const { sequelize, Company, User, Vehicle, VehicleMedia, CreditTransaction, Payment, ContactEvent, RefreshToken } = models;
const { authenticate, backOffice, requireRole, requirePermission } = require('../middleware/auth');
const { validate, uploadImage } = require('../middleware/common');
const { createUser } = require('./users.routes');
const wallet = require('../services/wallet.service');
const media = require('../services/media.service');
const email = require('../services/email.service');
const audit = require('../services/audit.service');
const backup = require('../services/backup.service');
const { AppError, ah, paginate, paged, slugify, mediaUrl, randomToken } = require('../utils/helpers');
const { ROLES, PERMISSIONS: P, VEHICLE_STATUS: S } = require('../utils/constants');

const companyFields = {
  name: Joi.string().trim().min(2).max(150),
  email: Joi.string().email().lowercase(),
  phone: Joi.string().trim().max(40).allow('', null),
  whatsapp: Joi.string().trim().max(40).allow('', null),
  website: Joi.string().trim().uri().max(190).allow('', null),
  address: Joi.string().trim().max(255).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  country: Joi.string().trim().max(100).allow('', null),
  taxId: Joi.string().trim().max(80).allow('', null),
  description: Joi.string().trim().max(3000).allow('', null),
  autoRenewDefault: Joi.boolean(),
};

const present = (c) => {
  const j = c.toJSON ? c.toJSON() : c;
  return { ...j, logoUrl: mediaUrl(j.logoUrl) };
};

async function uniqueSlug(name) {
  const base = slugify(name) || 'entreprise';
  let slug = base;
  while (await Company.findOne({ where: { slug } })) slug = `${base}-${randomToken(2)}`;
  return slug;
}

/* =================================================================== */
/* Super Administrateur                                                 */
/* =================================================================== */
const admin = express.Router();
admin.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

admin.get(
  '/',
  ah(async (req, res) => {
    const pg = paginate(req.query);
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.q) {
      const q = `%${req.query.q}%`;
      where[Op.or] = [{ name: { [Op.like]: q } }, { email: { [Op.like]: q } }, { city: { [Op.like]: q } }, { phone: { [Op.like]: q } }];
    }
    const sortable = { name: 'name', createdAt: 'createdAt', walletBalance: 'walletBalance' };
    const order = [[sortable[req.query.sort] || 'createdAt', req.query.dir === 'asc' ? 'ASC' : 'DESC']];
    const { rows, count } = await Company.findAndCountAll({ where, order, limit: pg.limit, offset: pg.offset });
    const ids = rows.map((r) => r.id);
    const [vehicleCounts, activeCounts, userCounts] = await Promise.all([
      Vehicle.count({ where: { companyId: ids }, group: ['companyId'] }),
      Vehicle.count({ where: { companyId: ids, status: S.ACTIVE }, group: ['companyId'] }),
      User.count({ where: { companyId: ids }, group: ['companyId'] }),
    ]);
    const m = (arr) => Object.fromEntries(arr.map((r) => [r.companyId, Number(r.count)]));
    const [vc, ac, uc] = [m(vehicleCounts), m(activeCounts), m(userCounts)];
    res.json(paged(rows.map((c) => ({ ...present(c), vehiclesCount: vc[c.id] || 0, activeVehicles: ac[c.id] || 0, usersCount: uc[c.id] || 0 })), count, pg));
  })
);

admin.get('/options', ah(async (req, res) => {
  const rows = await Company.findAll({ attributes: ['id', 'name', 'status'], order: [['name', 'ASC']] });
  res.json({ data: rows });
}));

admin.post(
  '/',
  validate(
    Joi.object({
      ...companyFields,
      name: companyFields.name.required(),
      email: companyFields.email.required(),
      initialCredits: Joi.number().integer().min(0).max(100000).default(0),
      admin: Joi.object({
        firstName: Joi.string().trim().min(2).max(80).required(),
        lastName: Joi.string().trim().min(2).max(80).required(),
        email: Joi.string().email().lowercase().required(),
        phone: Joi.string().trim().max(40).allow('', null),
        password: Joi.string().pattern(require('../services/auth.service').PASSWORD_RULE).allow('', null).messages({ 'string.pattern.base': 'Mot de passe : 8 caractères minimum, avec lettre et chiffre' }),
      }).required(),
    })
  ),
  ah(async (req, res) => {
    const { admin: adminData, initialCredits, ...data } = req.body;
    if (await User.findOne({ where: { email: adminData.email } })) throw AppError.conflict("L'email de l'administrateur est déjà utilisé");
    const company = await Company.create({ ...data, slug: await uniqueSlug(data.name) });
    let user;
    try {
      user = await createUser({ ...adminData, role: ROLES.COMPANY_ADMIN, companyId: company.id }, req);
    } catch (e) {
      await company.destroy();
      throw e;
    }
    if (initialCredits > 0) {
      await wallet.credit({ companyId: company.id, amount: initialCredits, type: 'adjustment', idempotencyKey: `initial:${company.id}`, description: 'Crédits offerts à la création', createdById: req.user.id });
    }
    audit.log(req, 'company.create', { entityType: 'company', entityId: company.id, companyId: company.id, description: `Création de l'entreprise ${company.name}` });
    res.status(201).json({ data: present(await company.reload()), admin: user });
  })
);

admin.get(
  '/:id',
  ah(async (req, res) => {
    const company = await Company.findByPk(req.params.id);
    if (!company) throw AppError.notFound('Entreprise introuvable');
    const [users, vehicles, active, expired, payments, contacts, spent] = await Promise.all([
      User.findAll({ where: { companyId: company.id }, order: [['createdAt', 'ASC']] }),
      Vehicle.count({ where: { companyId: company.id } }),
      Vehicle.count({ where: { companyId: company.id, status: S.ACTIVE } }),
      Vehicle.count({ where: { companyId: company.id, status: S.EXPIRED } }),
      Payment.sum('amount', { where: { companyId: company.id, status: 'completed' } }),
      ContactEvent.count({ where: { companyId: company.id } }),
      CreditTransaction.sum('amount', { where: { companyId: company.id, type: { [Op.in]: ['publish', 'renewal'] } } }),
    ]);
    res.json({ data: { ...present(company), users, stats: { vehicles, active, expired, revenue: Number(payments || 0), contacts, creditsSpent: Math.abs(spent || 0) } } });
  })
);

admin.patch(
  '/:id',
  validate(Joi.object(companyFields)),
  ah(async (req, res) => {
    const company = await Company.findByPk(req.params.id);
    if (!company) throw AppError.notFound('Entreprise introuvable');
    await company.update(req.body);
    audit.log(req, 'company.update', { entityType: 'company', entityId: company.id, companyId: company.id, description: `Modification de ${company.name}`, metadata: { fields: Object.keys(req.body) } });
    res.json({ data: present(company) });
  })
);

admin.post(
  '/:id/logo',
  uploadImage.single('logo'),
  ah(async (req, res) => {
    const company = await Company.findByPk(req.params.id);
    if (!company) throw AppError.notFound('Entreprise introuvable');
    if (!req.file) throw AppError.badRequest('Fichier requis');
    const old = company.logoUrl;
    await company.update({ logoUrl: await media.processLogo(req.file.path, company.id) });
    if (old) await media.removeFiles(old);
    res.json({ data: present(company) });
  })
);

admin.post(
  '/:id/status',
  validate(Joi.object({ status: Joi.string().valid('active', 'suspended').required(), reason: Joi.string().trim().max(255).allow('', null) })),
  ah(async (req, res) => {
    const company = await Company.findByPk(req.params.id);
    if (!company) throw AppError.notFound('Entreprise introuvable');
    await company.update({ status: req.body.status, suspendedReason: req.body.status === 'suspended' ? req.body.reason || null : null });
    if (req.body.status === 'suspended') {
      // Déconnecte immédiatement tous les collaborateurs.
      const ids = (await User.findAll({ where: { companyId: company.id }, attributes: ['id'] })).map((u) => u.id);
      await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: ids, revokedAt: null } });
    }
    email.queue('companyStatus', company.email, { company, status: req.body.status, reason: req.body.reason }, { companyId: company.id });
    audit.log(req, `company.${req.body.status === 'active' ? 'activate' : 'suspend'}`, { entityType: 'company', entityId: company.id, companyId: company.id, description: `${req.body.status === 'active' ? 'Réactivation' : 'Suspension'} de ${company.name}${req.body.reason ? ` — ${req.body.reason}` : ''}` });
    res.json({ data: present(company) });
  })
);

/** Ajustement manuel du wallet (crédit ou débit) par le Super Administrateur. */
admin.post(
  '/:id/wallet/adjust',
  validate(Joi.object({ amount: Joi.number().integer().invalid(0).min(-100000).max(100000).required(), reason: Joi.string().trim().min(3).max(200).required(), idempotencyKey: Joi.string().max(80) })),
  ah(async (req, res) => {
    const company = await Company.findByPk(req.params.id);
    if (!company) throw AppError.notFound('Entreprise introuvable');
    const { tx, duplicate } = await wallet.applyMovement({
      companyId: company.id,
      amount: req.body.amount,
      type: 'adjustment',
      idempotencyKey: `adjust:${req.body.idempotencyKey || randomToken(12)}`,
      description: `Ajustement : ${req.body.reason}`,
      createdById: req.user.id,
    });
    if (!duplicate) audit.log(req, 'wallet.adjust', { entityType: 'company', entityId: company.id, companyId: company.id, description: `Ajustement ${req.body.amount > 0 ? '+' : ''}${req.body.amount} crédits — ${req.body.reason}`, metadata: { transaction: tx.reference } });
    res.json({ data: tx, duplicate });
  })
);

/** Suppression définitive (sauvegarde automatique préalable). */
admin.delete(
  '/:id',
  validate(Joi.object({ confirm: Joi.string().required() })),
  ah(async (req, res) => {
    const company = await Company.findByPk(req.params.id);
    if (!company) throw AppError.notFound('Entreprise introuvable');
    if (req.body.confirm !== company.name) throw AppError.badRequest("Saisissez exactement le nom de l'entreprise pour confirmer");
    const snapshot = await backup.create(`before-delete-company-${company.id}`);
    const vehicleIds = (await Vehicle.findAll({ where: { companyId: company.id }, attributes: ['id'] })).map((v) => v.id);
    const userIds = (await User.findAll({ where: { companyId: company.id }, attributes: ['id'] })).map((u) => u.id);
    await sequelize.transaction(async (t) => {
      const w = { where: { companyId: company.id }, transaction: t };
      await models.VehicleFeature.destroy({ where: { vehicleId: vehicleIds }, transaction: t });
      await models.Favorite.destroy({ where: { vehicleId: vehicleIds }, transaction: t });
      await VehicleMedia.destroy({ where: { vehicleId: vehicleIds }, transaction: t });
      for (const m of ['VehicleEvent', 'VehicleView', 'ContactEvent', 'CreditTransaction', 'Payment', 'Vehicle']) await models[m].destroy(w);
      await RefreshToken.destroy({ where: { userId: userIds }, transaction: t });
      await models.ActionToken.destroy({ where: { userId: userIds }, transaction: t });
      await User.destroy(w);
      await company.destroy({ transaction: t });
    });
    await Promise.all(vehicleIds.map((id) => media.removeDir(`vehicles/${id}`)));
    await media.removeDir(`companies/${company.id}`);
    audit.log(req, 'company.delete', { entityType: 'company', entityId: company.id, description: `Suppression de l'entreprise ${company.name}`, metadata: { backup: snapshot.file } });
    res.json({ ok: true, backup: snapshot.file });
  })
);

/* =================================================================== */
/* Espace entreprise (entreprise de l'utilisateur connecté)             */
/* =================================================================== */
const own = express.Router();
own.use(authenticate, backOffice, (req, res, next) => (req.user.companyId ? next() : next(AppError.forbidden('Aucune entreprise associée à ce compte'))));

own.get(
  '/',
  requirePermission(P.COMPANY_VIEW),
  ah(async (req, res) => res.json({ data: present(await Company.findByPk(req.user.companyId)) }))
);

own.patch(
  '/',
  requirePermission(P.COMPANY_UPDATE),
  validate(Joi.object(companyFields)),
  ah(async (req, res) => {
    const company = await Company.findByPk(req.user.companyId);
    await company.update(req.body);
    audit.log(req, 'company.update', { entityType: 'company', entityId: company.id, description: 'Mise à jour du profil entreprise', metadata: { fields: Object.keys(req.body) } });
    res.json({ data: present(company) });
  })
);

own.post(
  '/logo',
  requirePermission(P.COMPANY_UPDATE),
  uploadImage.single('logo'),
  ah(async (req, res) => {
    if (!req.file) throw AppError.badRequest('Fichier requis');
    const company = await Company.findByPk(req.user.companyId);
    const old = company.logoUrl;
    await company.update({ logoUrl: await media.processLogo(req.file.path, company.id) });
    if (old) await media.removeFiles(old);
    audit.log(req, 'company.logo', { entityType: 'company', entityId: company.id, description: 'Nouveau logo' });
    res.json({ data: present(company) });
  })
);

module.exports = { admin, own };
