/**
 * /api/vehicles — gestion des véhicules (entreprises + super admin).
 * Toutes les requêtes sont filtrées par entreprise (isolation stricte).
 */
const router = require('express').Router();
const Joi = require('joi');
const { Op } = require('sequelize');
const config = require('../config');
const { Vehicle, VehicleMedia, VehicleEvent, Feature, Category, Company, VehicleFeature, sequelize } = require('../models');
const { authenticate, backOffice, requirePermission, requireRole, scopeCompanyId, assertOwnership, isSuperAdmin } = require('../middleware/auth');
const { validate, uploadMedia } = require('../middleware/common');
const vehicles = require('../services/vehicle.service');
const media = require('../services/media.service');
const audit = require('../services/audit.service');
const { AppError, ah, paginate, paged } = require('../utils/helpers');
const { PERMISSIONS: P, ROLES, VEHICLE_STATUS: S, AVAILABILITY, DRIVER_MODES } = require('../utils/constants');

router.use(authenticate, backOffice);

const year = new Date().getFullYear();
const price = Joi.number().min(0).max(100000000).allow(null);
const fields = {
  categoryId: Joi.number().integer().allow(null),
  brand: Joi.string().trim().min(1).max(80),
  model: Joi.string().trim().min(1).max(80),
  year: Joi.number().integer().min(1950).max(year + 1).allow(null),
  fuelType: Joi.string().valid('petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other').allow(null),
  transmission: Joi.string().valid('manual', 'automatic').allow(null),
  seats: Joi.number().integer().min(1).max(100).allow(null),
  doors: Joi.number().integer().min(0).max(10).allow(null),
  color: Joi.string().trim().max(50).allow('', null),
  plateNumber: Joi.string().trim().uppercase().max(30).allow('', null),
  mileage: Joi.number().integer().min(0).max(5000000).allow(null),
  city: Joi.string().trim().max(100).allow('', null),
  address: Joi.string().trim().max(255).allow('', null),
  priceDaily: price,
  priceWeekly: price,
  priceMonthly: price,
  currency: Joi.string().uppercase().length(3),
  driverMode: Joi.string().valid(...Object.values(DRIVER_MODES)),
  driverPriceDaily: price,
  driverPriceWeekly: price,
  driverPriceMonthly: price,
  description: Joi.string().trim().max(5000).allow('', null),
  rentalConditions: Joi.string().trim().max(5000).allow('', null),
  availability: Joi.string().valid(...Object.values(AVAILABILITY)),
  autoRenew: Joi.boolean(),
  featureIds: Joi.array().items(Joi.number().integer()).max(60),
};

async function load(req, id = req.params.id, include = vehicles.fullInclude) {
  const v = await Vehicle.findByPk(id, { include });
  return assertOwnership(req, v);
}

async function checkPlate(companyId, plate, exceptId) {
  if (!plate) return;
  const dup = await Vehicle.findOne({ where: { companyId, plateNumber: plate, ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}) } });
  if (dup) throw AppError.conflict(`L'immatriculation ${plate} est déjà enregistrée pour un autre véhicule`);
}

async function setFeatures(vehicle, ids) {
  if (!Array.isArray(ids)) return;
  const valid = await Feature.findAll({ where: { id: ids, active: true }, attributes: ['id'] });
  await vehicle.setFeatures(valid.map((f) => f.id));
}

/* ---------------- Liste ---------------- */
router.get(
  '/',
  requirePermission(P.VEHICLES_VIEW),
  ah(async (req, res) => {
    const pg = paginate(req.query, 12);
    const where = {};
    const companyId = scopeCompanyId(req, req.query.companyId);
    if (companyId) where.companyId = companyId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.availability) where.availability = req.query.availability;
    if (req.query.categoryId) where.categoryId = req.query.categoryId;
    if (req.query.expiringDays) {
      where.status = S.ACTIVE;
      where.expiresAt = { [Op.lte]: new Date(Date.now() + Number(req.query.expiringDays) * 86400000) };
    }
    if (req.query.q) {
      const q = `%${req.query.q}%`;
      where[Op.or] = [{ brand: { [Op.like]: q } }, { model: { [Op.like]: q } }, { plateNumber: { [Op.like]: q } }, { city: { [Op.like]: q } }];
    }
    const sorts = { recent: [['createdAt', 'DESC']], expiry: [['expiresAt', 'ASC']], views: [['viewsCount', 'DESC']], price: [['priceDaily', 'ASC']], brand: [['brand', 'ASC']] };
    const { rows, count } = await Vehicle.findAndCountAll({
      where,
      include: [
        { model: VehicleMedia, as: 'media' },
        { model: Category, as: 'category' },
        { model: Company, as: 'company', attributes: ['id', 'name', 'status'] },
      ],
      order: sorts[req.query.sort] || sorts.recent,
      limit: pg.limit,
      offset: pg.offset,
      distinct: true,
    });
    const counts = await Vehicle.count({ where: companyId ? { companyId } : {}, group: ['status'] });
    res.json({ ...paged(rows.map((v) => vehicles.serialize(v)), count, pg), statusCounts: Object.fromEntries(counts.map((c) => [c.status, Number(c.count)])) });
  })
);

router.get(
  '/:id',
  requirePermission(P.VEHICLES_VIEW),
  ah(async (req, res) => {
    const v = await load(req);
    const events = await VehicleEvent.findAll({ where: { vehicleId: v.id }, order: [['createdAt', 'DESC']], limit: 50 });
    res.json({ data: { ...vehicles.serialize(v), events } });
  })
);

/* ---------------- Création / modification ---------------- */
router.post(
  '/',
  requirePermission(P.VEHICLES_MANAGE),
  validate(Joi.object({ ...fields, brand: fields.brand.required(), model: fields.model.required(), companyId: Joi.number().integer() })),
  ah(async (req, res) => {
    const { featureIds, companyId: requested, ...data } = req.body;
    const companyId = isSuperAdmin(req.user) ? requested : req.user.companyId;
    if (!companyId) throw AppError.badRequest('Entreprise requise');
    const company = await Company.findByPk(companyId);
    if (!company) throw AppError.badRequest('Entreprise introuvable');
    if (data.categoryId && !(await Category.findByPk(data.categoryId))) throw AppError.badRequest('Catégorie introuvable');
    await checkPlate(companyId, data.plateNumber);
    const v = await Vehicle.create({ ...data, autoRenew: data.autoRenew ?? company.autoRenewDefault, companyId, status: S.DRAFT, createdById: req.user.id });
    await setFeatures(v, featureIds);
    audit.log(req, 'vehicle.create', { entityType: 'vehicle', entityId: v.id, companyId, description: `Création ${v.brand} ${v.model}` });
    res.status(201).json({ data: vehicles.serialize(await load(req, v.id)) });
  })
);

router.patch(
  '/:id',
  requirePermission(P.VEHICLES_MANAGE),
  validate(Joi.object(fields)),
  ah(async (req, res) => {
    const v = await load(req);
    const { featureIds, ...data } = req.body;
    if (data.categoryId && !(await Category.findByPk(data.categoryId))) throw AppError.badRequest('Catégorie introuvable');
    if (data.plateNumber) await checkPlate(v.companyId, data.plateNumber, v.id);
    // Un véhicule publié doit rester complet.
    if ([S.ACTIVE, S.PENDING].includes(v.status)) {
      const merged = { ...v.toJSON(), ...data, media: v.media };
      const c = vehicles.completeness(merged);
      if (!c.ready) throw AppError.badRequest('Un véhicule publié doit rester complet', c.missing.map((m) => ({ field: 'vehicle', message: m })));
    }
    await v.update(data);
    await setFeatures(v, featureIds);
    audit.log(req, 'vehicle.update', { entityType: 'vehicle', entityId: v.id, companyId: v.companyId, description: `Modification ${v.brand} ${v.model}`, metadata: { fields: Object.keys(req.body) } });
    res.json({ data: vehicles.serialize(await load(req, v.id)) });
  })
);

router.delete(
  '/:id',
  requirePermission(P.VEHICLES_MANAGE),
  ah(async (req, res) => {
    const v = await load(req, req.params.id, []);
    await sequelize.transaction(async (t) => {
      await VehicleFeature.destroy({ where: { vehicleId: v.id }, transaction: t });
      await v.destroy({ transaction: t });
    });
    await media.removeDir(`vehicles/${v.id}`);
    audit.log(req, 'vehicle.delete', { entityType: 'vehicle', entityId: v.id, companyId: v.companyId, description: `Suppression ${v.brand} ${v.model}` });
    res.json({ ok: true });
  })
);

/* ---------------- Médias ---------------- */
router.post(
  '/:id/media',
  requirePermission(P.VEHICLES_MANAGE),
  uploadMedia.fields([
    { name: 'photos', maxCount: config.media.maxPhotos },
    { name: 'video', maxCount: 1 },
  ]),
  ah(async (req, res) => {
    const photos = req.files?.photos || [];
    const videos = req.files?.video || [];
    const all = [...photos, ...videos];
    try {
      const v = await load(req, req.params.id, [{ model: VehicleMedia, as: 'media' }]);
      if (!all.length) throw AppError.badRequest('Aucun fichier reçu');
      const existingPhotos = v.media.filter((m) => m.type === 'photo').length;
      if (existingPhotos + photos.length > config.media.maxPhotos) throw AppError.badRequest(`${config.media.maxPhotos} photos maximum par véhicule`);
      if (videos.length && v.media.some((m) => m.type === 'video')) throw AppError.badRequest('Une vidéo existe déjà : supprimez-la avant d’en ajouter une nouvelle');
      if (photos.some((p) => !p.mimetype.startsWith('image/'))) throw AppError.badRequest('Le champ photos n’accepte que des images');
      if (videos.some((p) => !p.mimetype.startsWith('video/'))) throw AppError.badRequest('Le champ vidéo n’accepte que des vidéos');
      if (photos.some((p) => p.size > config.media.maxPhotoBytes)) throw AppError.badRequest('Photo trop volumineuse : 10 Mo maximum');

      const dir = `vehicles/${v.id}`;
      let order = v.media.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1;
      const created = [];
      for (const f of photos) {
        const out = await media.processPhoto(f.path, dir);
        created.push(await VehicleMedia.create({ vehicleId: v.id, type: 'photo', sortOrder: order++, ...out }));
      }
      for (const f of videos) {
        const out = await media.processVideo(f.path, f.size, dir);
        created.push(await VehicleMedia.create({ vehicleId: v.id, type: 'video', sortOrder: 999, ...out }));
      }
      audit.log(req, 'vehicle.media_upload', { entityType: 'vehicle', entityId: v.id, companyId: v.companyId, description: `${photos.length} photo(s), ${videos.length} vidéo(s) ajoutée(s)` });
      res.status(201).json({ data: vehicles.serialize(await load(req, v.id)) });
    } finally {
      await Promise.all(all.map((f) => media.safeUnlink(f.path)));
    }
  })
);

router.delete(
  '/:id/media/:mediaId',
  requirePermission(P.VEHICLES_MANAGE),
  ah(async (req, res) => {
    const v = await load(req, req.params.id, [{ model: VehicleMedia, as: 'media' }]);
    const m = v.media.find((x) => x.id === Number(req.params.mediaId));
    if (!m) throw AppError.notFound('Média introuvable');
    const photos = v.media.filter((x) => x.type === 'photo').length;
    if (m.type === 'photo' && [S.ACTIVE, S.PENDING].includes(v.status) && photos <= config.media.minPhotos) {
      throw AppError.badRequest(`Un véhicule publié doit conserver au moins ${config.media.minPhotos} photos. Ajoutez une photo avant d’en supprimer une.`);
    }
    await m.destroy();
    await media.removeFiles(m.path, m.thumbPath);
    res.json({ data: vehicles.serialize(await load(req, v.id)) });
  })
);

router.put(
  '/:id/media/order',
  requirePermission(P.VEHICLES_MANAGE),
  validate(Joi.object({ ids: Joi.array().items(Joi.number().integer()).min(1).required() })),
  ah(async (req, res) => {
    const v = await load(req, req.params.id, [{ model: VehicleMedia, as: 'media' }]);
    await sequelize.transaction(async (t) => {
      for (const [i, id] of req.body.ids.entries()) {
        const m = v.media.find((x) => x.id === id && x.type === 'photo');
        if (m) await m.update({ sortOrder: i }, { transaction: t });
      }
    });
    res.json({ data: vehicles.serialize(await load(req, v.id)) });
  })
);

/* ---------------- Publication & cycle de vie ---------------- */
router.post(
  '/:id/publish',
  requirePermission(P.VEHICLES_PUBLISH),
  ah(async (req, res) => {
    await load(req, req.params.id, []); // contrôle d'appartenance
    const r = await vehicles.publish(Number(req.params.id), req);
    res.json({ data: vehicles.serialize(await load(req)), transaction: r.transaction, pending: r.pending });
  })
);

router.patch(
  '/:id/auto-renew',
  requirePermission(P.VEHICLES_PUBLISH),
  validate(Joi.object({ autoRenew: Joi.boolean().required() })),
  ah(async (req, res) => {
    const v = await load(req, req.params.id, []);
    await v.update({ autoRenew: req.body.autoRenew });
    audit.log(req, 'vehicle.auto_renew_toggle', { entityType: 'vehicle', entityId: v.id, companyId: v.companyId, description: `Renouvellement automatique ${req.body.autoRenew ? 'activé' : 'désactivé'} — ${v.brand} ${v.model}` });
    res.json({ data: { id: v.id, autoRenew: v.autoRenew } });
  })
);

router.patch(
  '/:id/availability',
  requirePermission(P.VEHICLES_MANAGE),
  validate(Joi.object({ availability: Joi.string().valid(...Object.values(AVAILABILITY)).required() })),
  ah(async (req, res) => {
    const v = await load(req, req.params.id, []);
    await v.update({ availability: req.body.availability });
    res.json({ data: { id: v.id, availability: v.availability } });
  })
);

/** Modération par le Super Administrateur : approve | reject | suspend | reactivate */
router.post(
  '/:id/moderate',
  requireRole(ROLES.SUPER_ADMIN),
  validate(Joi.object({ action: Joi.string().valid('approve', 'reject', 'suspend', 'reactivate').required(), reason: Joi.string().trim().max(255).allow('', null) })),
  ah(async (req, res) => {
    await vehicles.moderate(Number(req.params.id), req.body.action, req.body.reason, req);
    res.json({ data: vehicles.serialize(await load(req)) });
  })
);

module.exports = router;
