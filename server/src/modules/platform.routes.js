/**
 * Routes de plateforme :
 *   /api/catalog   — catégories et caractéristiques des véhicules
 *   /api/contacts  — demandes et contacts clients (par entreprise)
 *   /api/settings  — paramètres généraux, tarification, SMTP Gmail
 *   /api/stats     — tableaux de bord
 *   /api/audit     — journaux d'activité et d'emails
 *   /api/backups   — sauvegarde et restauration de la base
 *   /api/jobs      — exécution manuelle des tâches planifiées
 */
const express = require('express');
const fs = require('fs');
const Joi = require('joi');
const { Op } = require('sequelize');
const { Category, Feature, Vehicle, ContactEvent, AuditLog, EmailLog, User, Company } = require('../models');
const { authenticate, backOffice, requireRole, requirePermission, scopeCompanyId, assertOwnership } = require('../middleware/auth');
const { validate, uploadBackup } = require('../middleware/common');
const settings = require('../services/settings.service');
const email = require('../services/email.service');
const stats = require('../services/stats.service');
const audit = require('../services/audit.service');
const backup = require('../services/backup.service');
const jobs = require('../jobs/scheduler');
const { dateRange } = require('./wallet.routes');
const { AppError, ah, paginate, paged, slugify } = require('../utils/helpers');
const { ROLES, PERMISSIONS: P } = require('../utils/constants');

const superAdmin = [authenticate, requireRole(ROLES.SUPER_ADMIN)];

/* =================================================================== */
/* Catalogue                                                            */
/* =================================================================== */
const catalog = express.Router();
catalog.use(authenticate, backOffice);

function crud(Model, label, extra = {}) {
  const r = express.Router();
  const fields = { name: Joi.string().trim().min(2).max(100), icon: Joi.string().trim().max(60).allow('', null), active: Joi.boolean(), ...extra };
  r.get(
    '/',
    ah(async (req, res) => {
      const rows = await Model.findAll({ order: Model.rawAttributes.sortOrder ? [['sortOrder', 'ASC'], ['name', 'ASC']] : [['name', 'ASC']] });
      const usage = Model === Category ? await Vehicle.count({ group: ['categoryId'] }) : [];
      const u = Object.fromEntries(usage.map((x) => [x.categoryId, Number(x.count)]));
      res.json({ data: rows.map((x) => ({ ...x.toJSON(), vehiclesCount: Model === Category ? u[x.id] || 0 : undefined })) });
    })
  );
  r.post(
    '/',
    requireRole(ROLES.SUPER_ADMIN),
    validate(Joi.object({ ...fields, name: fields.name.required() })),
    ah(async (req, res) => {
      const row = await Model.create({ ...req.body, slug: slugify(req.body.name) });
      audit.log(req, `${label}.create`, { entityType: label, entityId: row.id, description: `Création ${row.name}` });
      res.status(201).json({ data: row });
    })
  );
  r.patch(
    '/:id',
    requireRole(ROLES.SUPER_ADMIN),
    validate(Joi.object(fields)),
    ah(async (req, res) => {
      const row = await Model.findByPk(req.params.id);
      if (!row) throw AppError.notFound();
      await row.update({ ...req.body, ...(req.body.name ? { slug: slugify(req.body.name) } : {}) });
      audit.log(req, `${label}.update`, { entityType: label, entityId: row.id, description: `Modification ${row.name}` });
      res.json({ data: row });
    })
  );
  r.delete(
    '/:id',
    requireRole(ROLES.SUPER_ADMIN),
    ah(async (req, res) => {
      const row = await Model.findByPk(req.params.id);
      if (!row) throw AppError.notFound();
      if (Model === Category && (await Vehicle.count({ where: { categoryId: row.id } }))) throw AppError.conflict('Catégorie utilisée par des véhicules : désactivez-la plutôt');
      if (Model === Feature) await row.setVehicles([]);
      await row.destroy();
      audit.log(req, `${label}.delete`, { entityType: label, entityId: row.id, description: `Suppression ${row.name}` });
      res.json({ ok: true });
    })
  );
  return r;
}
catalog.use('/categories', crud(Category, 'category', { description: Joi.string().trim().max(255).allow('', null), sortOrder: Joi.number().integer() }));
catalog.use('/features', crud(Feature, 'feature'));

/* =================================================================== */
/* Contacts clients                                                     */
/* =================================================================== */
const contacts = express.Router();
contacts.use(authenticate, backOffice, requirePermission(P.CONTACTS_VIEW));

contacts.get(
  '/',
  ah(async (req, res) => {
    const pg = paginate(req.query);
    const where = { ...dateRange(req.query) };
    const companyId = scopeCompanyId(req, req.query.companyId);
    if (companyId) where.companyId = companyId;
    if (req.query.channel) where.channel = req.query.channel;
    if (req.query.status) where.status = req.query.status;
    if (req.query.vehicleId) where.vehicleId = req.query.vehicleId;
    const { rows, count } = await ContactEvent.findAndCountAll({
      where,
      attributes: { exclude: ['visitorHash'] },
      include: [{ model: Vehicle, as: 'vehicle', attributes: ['id', 'brand', 'model', 'year', 'currency'] }],
      order: [['createdAt', 'DESC']],
      limit: pg.limit,
      offset: pg.offset,
    });
    const byStatus = await ContactEvent.count({ where: companyId ? { companyId } : {}, group: ['status'] });
    res.json({ ...paged(rows, count, pg), statusCounts: Object.fromEntries(byStatus.map((s) => [s.status, Number(s.count)])) });
  })
);

contacts.patch(
  '/:id',
  requirePermission(P.CONTACTS_MANAGE),
  validate(Joi.object({ status: Joi.string().valid('new', 'in_progress', 'closed').required() })),
  ah(async (req, res) => {
    const c = assertOwnership(req, await ContactEvent.findByPk(req.params.id));
    await c.update({ status: req.body.status });
    res.json({ data: c });
  })
);

/* =================================================================== */
/* Paramètres                                                           */
/* =================================================================== */
const settingsRouter = express.Router();

settingsRouter.get(
  '/billing',
  authenticate,
  backOffice,
  ah(async (req, res) => res.json({ data: await settings.get('billing') }))
);

settingsRouter.use(...superAdmin);

settingsRouter.get(
  '/',
  ah(async (req, res) => res.json({ data: { general: await settings.get('general'), billing: await settings.get('billing'), smtp: await settings.getSmtpPublic() } }))
);

settingsRouter.put(
  '/general',
  validate(
    Joi.object({
      platformName: Joi.string().trim().min(2).max(60).required(),
      supportEmail: Joi.string().email().required(),
      supportPhone: Joi.string().trim().max(40).allow(''),
      address: Joi.string().trim().max(200).allow(''),
      currency: Joi.string().uppercase().length(3).required(),
      requireVehicleApproval: Joi.boolean().required(),
      allowClientRegistration: Joi.boolean().required(),
    })
  ),
  ah(async (req, res) => {
    const data = await settings.set('general', req.body);
    audit.log(req, 'settings.general', { entityType: 'settings', description: 'Paramètres généraux modifiés', metadata: req.body });
    res.json({ data });
  })
);

settingsRouter.put(
  '/billing',
  validate(
    Joi.object({
      packPriceUsd: Joi.number().positive().max(100000).required(),
      packCredits: Joi.number().integer().positive().max(100000).required(),
      publishCost: Joi.number().integer().positive().max(100000).required(),
      validityMonths: Joi.number().integer().min(1).max(60).required(),
      reminderDays: Joi.array().items(Joi.number().integer().min(1).max(365)).max(5).required(),
      minTopupPacks: Joi.number().integer().min(1).required(),
      maxTopupPacks: Joi.number().integer().min(Joi.ref('minTopupPacks')).max(10000).required(),
    })
  ),
  ah(async (req, res) => {
    const data = await settings.set('billing', req.body);
    audit.log(req, 'settings.billing', { entityType: 'settings', description: 'Tarification et règles de facturation modifiées', metadata: req.body });
    res.json({ data });
  })
);

const smtpSchema = Joi.object({
  host: Joi.string().trim().hostname().required(),
  port: Joi.number().integer().min(1).max(65535).required(),
  secure: Joi.string().valid('tls', 'ssl', 'none').required(),
  user: Joi.string().email().required(),
  password: Joi.string().allow('', null).max(200),
  fromName: Joi.string().trim().max(80).allow(''),
  replyTo: Joi.string().email().allow('', null),
  enabled: Joi.boolean().required(),
});

settingsRouter.put(
  '/smtp',
  validate(smtpSchema),
  ah(async (req, res) => {
    const data = await settings.setSmtp(req.body);
    // Le mot de passe n'apparaît jamais dans les journaux.
    audit.log(req, 'settings.smtp', { entityType: 'settings', description: 'Configuration SMTP modifiée', metadata: { host: req.body.host, port: req.body.port, user: req.body.user, passwordChanged: Boolean(req.body.password) } });
    res.json({ data });
  })
);

settingsRouter.post(
  '/smtp/test',
  validate(Joi.object({ to: Joi.string().email().required(), config: smtpSchema.optional() })),
  ah(async (req, res) => {
    try {
      await email.testSmtp(req.body.to, req.body.config);
      audit.log(req, 'settings.smtp_test', { entityType: 'settings', description: `Test SMTP réussi vers ${req.body.to}` });
      res.json({ ok: true, message: `Email de test envoyé à ${req.body.to}` });
    } catch (e) {
      audit.log(req, 'settings.smtp_test_failed', { entityType: 'settings', description: `Test SMTP échoué : ${e.message}` });
      throw AppError.badRequest(`Échec du test SMTP : ${e.message}`);
    }
  })
);

/* ---------------- FlexPay (paiement en ligne des crédits) ---------------- */
const httpUrl = Joi.string().trim().uri({ scheme: ['https', 'http'] });
const flexpaySchema = Joi.object({
  enabled: Joi.boolean(),
  merchant: Joi.string().trim().max(60).allow(''),
  token: Joi.string().trim().max(4000).allow('', null),
  mobileUrl: httpUrl.allow(''),
  checkUrl: httpUrl.allow(''),
  callbackBaseUrl: httpUrl.allow(''),
});

settingsRouter.get(
  '/flexpay',
  ah(async (req, res) => {
    const flexpay = require('../services/payment/flexpay');
    const cfg = await settings.getFlexpayPublic();
    res.json({ data: { ...cfg, webhookUrl: flexpay.callbackUrl(cfg) } });
  })
);

settingsRouter.put(
  '/flexpay',
  validate(flexpaySchema),
  ah(async (req, res) => {
    const flexpay = require('../services/payment/flexpay');
    const cfg = await settings.setFlexpay(req.body);
    // Le jeton n'est jamais journalisé.
    audit.log(req, 'settings.flexpay', { entityType: 'settings', description: 'Configuration FlexPay modifiée', metadata: { enabled: cfg.enabled, merchant: cfg.merchant, tokenChanged: Boolean(req.body.token) } });
    res.json({ data: { ...cfg, webhookUrl: flexpay.callbackUrl(cfg) } });
  })
);

settingsRouter.post(
  '/flexpay/test',
  validate(Joi.object({ token: Joi.string().trim().max(4000).allow('', null), checkUrl: httpUrl.allow('') })),
  ah(async (req, res) => {
    const flexpay = require('../services/payment/flexpay');
    const override = {};
    if (req.body.token) override.token = req.body.token.replace(/^Bearer\s+/i, '');
    if (req.body.checkUrl) override.checkUrl = req.body.checkUrl;
    try {
      const r = await flexpay.testConnection(override);
      audit.log(req, 'settings.flexpay_test', { entityType: 'settings', description: 'Test de connexion FlexPay réussi' });
      res.json({ ok: true, message: `Connexion FlexPay établie (${r.message})` });
    } catch (e) {
      audit.log(req, 'settings.flexpay_test_failed', { entityType: 'settings', description: `Test FlexPay échoué : ${e.message}` });
      throw AppError.badRequest(`Échec du test FlexPay : ${e.message}`);
    }
  })
);

/** Notification administrative à une ou plusieurs entreprises. */
settingsRouter.post(
  '/notify',
  validate(Joi.object({ companyIds: Joi.array().items(Joi.number().integer()).min(1), all: Joi.boolean(), title: Joi.string().trim().min(3).max(150).required(), message: Joi.string().trim().min(3).max(5000).required() })),
  ah(async (req, res) => {
    const where = req.body.all ? { status: 'active' } : { id: req.body.companyIds || [] };
    const companies = await Company.findAll({ where, attributes: ['id', 'email'] });
    if (!companies.length) throw AppError.badRequest('Aucune entreprise sélectionnée');
    companies.forEach((c) => email.queue('adminNotification', c.email, { title: req.body.title, message: req.body.message }, { companyId: c.id }));
    audit.log(req, 'notification.send', { entityType: 'notification', description: `${req.body.title} → ${companies.length} entreprise(s)` });
    res.json({ ok: true, recipients: companies.length });
  })
);

/* =================================================================== */
/* Statistiques                                                         */
/* =================================================================== */
const statsRouter = express.Router();
statsRouter.use(authenticate, backOffice);
statsRouter.get('/admin', requireRole(ROLES.SUPER_ADMIN), ah(async (req, res) => res.json({ data: await stats.adminDashboard() })));
statsRouter.get(
  '/company',
  requirePermission(P.STATS_VIEW),
  ah(async (req, res) => {
    const companyId = scopeCompanyId(req, req.query.companyId);
    if (!companyId) throw AppError.badRequest('Entreprise requise');
    res.json({ data: await stats.companyDashboard(companyId) });
  })
);

/* =================================================================== */
/* Journaux                                                             */
/* =================================================================== */
const auditRouter = express.Router();
auditRouter.use(authenticate, backOffice);

auditRouter.get(
  '/logs',
  ah(async (req, res) => {
    // Les entreprises ne voient que leur propre journal (administrateurs d'entreprise uniquement).
    if (req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.COMPANY_ADMIN) throw AppError.forbidden();
    const pg = paginate(req.query, 30);
    const where = { ...dateRange(req.query) };
    const companyId = scopeCompanyId(req, req.query.companyId);
    if (companyId) where.companyId = companyId;
    if (req.query.action) where.action = { [Op.like]: `${req.query.action}%` };
    if (req.query.userId) where.userId = req.query.userId;
    if (req.query.q) where.description = { [Op.like]: `%${req.query.q}%` };
    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] }, { model: Company, as: 'company', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
      limit: pg.limit,
      offset: pg.offset,
    });
    res.json(paged(rows, count, pg));
  })
);

auditRouter.get(
  '/emails',
  requireRole(ROLES.SUPER_ADMIN),
  ah(async (req, res) => {
    const pg = paginate(req.query, 30);
    const where = { ...dateRange(req.query) };
    if (req.query.status) where.status = req.query.status;
    if (req.query.q) where[Op.or] = [{ to: { [Op.like]: `%${req.query.q}%` } }, { subject: { [Op.like]: `%${req.query.q}%` } }];
    const { rows, count } = await EmailLog.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit: pg.limit, offset: pg.offset });
    res.json(paged(rows, count, pg));
  })
);

/* =================================================================== */
/* Sauvegardes                                                          */
/* =================================================================== */
const backups = express.Router();
backups.use(...superAdmin);

backups.get('/', ah(async (req, res) => res.json({ data: await backup.list() })));
backups.post(
  '/',
  ah(async (req, res) => {
    const r = await backup.create('manual');
    audit.log(req, 'backup.create', { entityType: 'backup', entityId: r.file, description: 'Sauvegarde manuelle de la base' });
    res.status(201).json({ data: r });
  })
);
backups.get(
  '/:file/download',
  ah(async (req, res) => {
    const p = backup.filePath(req.params.file);
    if (!fs.existsSync(p)) throw AppError.notFound('Sauvegarde introuvable');
    audit.log(req, 'backup.download', { entityType: 'backup', entityId: req.params.file, description: 'Téléchargement d’une sauvegarde' });
    res.download(p);
  })
);
backups.delete(
  '/:file',
  ah(async (req, res) => {
    await backup.remove(req.params.file);
    audit.log(req, 'backup.delete', { entityType: 'backup', entityId: req.params.file, description: 'Suppression d’une sauvegarde' });
    res.json({ ok: true });
  })
);
backups.post(
  '/:file/restore',
  validate(Joi.object({ confirm: Joi.string().valid('RESTAURER').required() })),
  ah(async (req, res) => {
    const p = backup.filePath(req.params.file);
    if (!fs.existsSync(p)) throw AppError.notFound('Sauvegarde introuvable');
    const r = await backup.restore(fs.readFileSync(p));
    audit.log(req, 'backup.restore', { entityType: 'backup', entityId: req.params.file, description: 'Restauration de la base', metadata: r });
    res.json({ data: r });
  })
);
backups.post(
  '/upload-restore',
  uploadBackup.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw AppError.badRequest('Fichier requis');
    if (req.body.confirm !== 'RESTAURER') {
      fs.unlink(req.file.path, () => {});
      throw AppError.badRequest('Confirmation requise');
    }
    try {
      const r = await backup.restore(fs.readFileSync(req.file.path));
      audit.log(req, 'backup.restore', { entityType: 'backup', description: 'Restauration depuis un fichier importé', metadata: r });
      res.json({ data: r });
    } finally {
      fs.unlink(req.file.path, () => {});
    }
  })
);

/* =================================================================== */
/* Tâches planifiées                                                    */
/* =================================================================== */
const jobsRouter = express.Router();
jobsRouter.use(...superAdmin);
jobsRouter.get('/', (req, res) => res.json({ data: jobs.status() }));
jobsRouter.post(
  '/expirations/run',
  ah(async (req, res) => {
    const r = await jobs.runExpirations('manual');
    audit.log(req, 'jobs.run', { entityType: 'job', description: `Exécution manuelle des expirations : ${JSON.stringify(r)}` });
    res.json({ data: r });
  })
);

module.exports = { catalog, contacts, settingsRouter, statsRouter, auditRouter, backups, jobsRouter };
