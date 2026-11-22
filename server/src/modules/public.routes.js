/**
 * /api/public — API destinée aux clients (application mobile Flutter).
 * Accès libre et gratuit ; seuls les véhicules actifs, non expirés et appartenant
 * à une entreprise active sont visibles.
 */
const router = require('express').Router();
const Joi = require('joi');
const { Op, fn, col } = require('sequelize');
const { Vehicle, VehicleMedia, VehicleView, ContactEvent, Category, Feature, Company, Favorite, sequelize } = require('../models');
const { optionalAuth, authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/common');
const vehicles = require('../services/vehicle.service');
const settings = require('../services/settings.service');
const pricing = require('../services/pricing.service');
const { AppError, ah, paginate, paged, sha256, clientIp, mediaUrl } = require('../utils/helpers');
const { ROLES } = require('../utils/constants');

router.use(optionalAuth);

const visitor = (req) => sha256(`${clientIp(req)}|${req.headers['user-agent'] || ''}|${req.user?.id || ''}`);
const activeCompany = { model: Company, as: 'company', where: { status: 'active' }, required: true };
const listInclude = [{ model: VehicleMedia, as: 'media' }, { model: Category, as: 'category' }, activeCompany];

/** Configuration publique : catégories, caractéristiques et bornes des filtres. */
router.get(
  '/config',
  ah(async (req, res) => {
    const general = await settings.get('general');
    const where = vehicles.publicWhere();
    const inc = [{ model: Company, as: 'company', where: { status: 'active' }, attributes: [], required: true }];
    const [categories, features, brands, cities, bounds] = await Promise.all([
      Category.findAll({ where: { active: true }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] }),
      Feature.findAll({ where: { active: true }, order: [['name', 'ASC']] }),
      Vehicle.findAll({ where, include: inc, attributes: ['brand', [fn('COUNT', col('Vehicle.id')), 'count']], group: ['brand'], order: [['brand', 'ASC']], raw: true }),
      Vehicle.findAll({ where, include: inc, attributes: [[col('Vehicle.city'), 'city'], [fn('COUNT', col('Vehicle.id')), 'count']], group: [col('Vehicle.city')], order: [[col('Vehicle.city'), 'ASC']], raw: true }),
      Vehicle.findOne({ where, include: inc, attributes: [[fn('MIN', col('Vehicle.price_daily')), 'min'], [fn('MAX', col('Vehicle.price_daily')), 'max'], [fn('MAX', col('Vehicle.seats')), 'maxSeats']], raw: true }),
    ]);
    const catCounts = await Vehicle.count({ where, include: inc, group: ['categoryId'] });
    const cc = Object.fromEntries(catCounts.map((c) => [c.categoryId, Number(c.count)]));
    res.json({
      data: {
        platformName: general.platformName,
        supportEmail: general.supportEmail,
        supportPhone: general.supportPhone,
        currency: general.currency,
        allowClientRegistration: general.allowClientRegistration,
        allowCompanyRegistration: general.allowCompanyRegistration,
        requireCompanyApproval: general.requireCompanyApproval,
        categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon, count: cc[c.id] || 0 })),
        features: features.map((f) => ({ id: f.id, name: f.name, slug: f.slug, icon: f.icon })),
        brands: brands.filter((b) => b.brand).map((b) => ({ name: b.brand, count: Number(b.count) })),
        cities: cities.filter((c) => c.city).map((c) => ({ name: c.city, count: Number(c.count) })),
        priceRange: { min: Number(bounds?.min || 0), max: Number(bounds?.max || 0) },
        maxSeats: Number(bounds?.maxSeats || 9),
        fuelTypes: ['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other'],
        transmissions: ['manual', 'automatic'],
      },
    });
  })
);

const searchSchema = Joi.object({
  q: Joi.string().trim().max(100).allow(''),
  categoryId: Joi.alternatives(Joi.number().integer(), Joi.string().pattern(/^\d+(,\d+)*$/)),
  brand: Joi.string().trim().max(80),
  model: Joi.string().trim().max(80),
  city: Joi.string().trim().max(100),
  minPrice: Joi.number().min(0),
  maxPrice: Joi.number().min(0),
  priceType: Joi.string().valid('daily', 'weekly', 'monthly').default('daily'),
  seats: Joi.number().integer().min(1),
  doors: Joi.number().integer().min(0),
  transmission: Joi.string().valid('manual', 'automatic'),
  fuelType: Joi.string().pattern(/^[a-z,]+$/),
  minYear: Joi.number().integer(),
  // with = location avec chauffeur possible (option ou inclus) ; without = sans chauffeur possible
  driver: Joi.string().valid('with', 'without'),
  withDriver: Joi.boolean(),
  availableOnly: Joi.boolean(),
  featureIds: Joi.string().pattern(/^\d+(,\d+)*$/),
  companyId: Joi.number().integer(),
  sort: Joi.string().valid('recent', 'price_asc', 'price_desc', 'popular').default('recent'),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(50),
});

router.get(
  '/vehicles',
  validate(searchSchema, 'query'),
  ah(async (req, res) => {
    const q = req.validQuery;
    const pg = paginate(q, 12);
    const where = { ...vehicles.publicWhere() };
    const and = [];
    if (q.q) {
      const like = `%${q.q}%`;
      and.push({ [Op.or]: [{ brand: { [Op.like]: like } }, { model: { [Op.like]: like } }, { city: { [Op.like]: like } }, { description: { [Op.like]: like } }] });
    }
    if (q.categoryId) where.categoryId = String(q.categoryId).split(',').map(Number);
    if (q.brand) where.brand = q.brand;
    if (q.model) where.model = { [Op.like]: `%${q.model}%` };
    if (q.city) where.city = q.city;
    const priceCol = { daily: 'priceDaily', weekly: 'priceWeekly', monthly: 'priceMonthly' }[q.priceType];
    const priceField = { daily: 'price_daily', weekly: 'price_weekly', monthly: 'price_monthly' }[q.priceType];
    if (q.minPrice != null || q.maxPrice != null) {
      where[priceCol] = { [Op.ne]: null, ...(q.minPrice != null ? { [Op.gte]: q.minPrice } : {}), ...(q.maxPrice != null ? { [Op.lte]: q.maxPrice } : {}) };
    }
    if (q.seats) where.seats = { [Op.gte]: q.seats };
    if (q.doors) where.doors = { [Op.gte]: q.doors };
    if (q.transmission) where.transmission = q.transmission;
    if (q.fuelType) where.fuelType = q.fuelType.split(',');
    if (q.minYear) where.year = { [Op.gte]: q.minYear };
    const driver = q.driver || (q.withDriver === true ? 'with' : q.withDriver === false ? 'without' : null);
    if (driver === 'with') where.driverMode = ['optional', 'included'];
    if (driver === 'without') where.driverMode = ['none', 'optional'];
    if (q.availableOnly) where.availability = 'available';
    if (q.companyId) where.companyId = q.companyId;
    if (q.featureIds) {
      // Le véhicule doit posséder TOUTES les caractéristiques demandées.
      const ids = q.featureIds.split(',').map(Number);
      const rows = await sequelize.models.VehicleFeature.findAll({
        attributes: ['vehicleId'],
        where: { featureId: ids },
        group: ['vehicleId'],
        having: sequelize.where(fn('COUNT', col('feature_id')), ids.length),
        raw: true,
      });
      where.id = rows.map((r) => r.vehicleId);
    }
    if (and.length) where[Op.and] = and;

    const order = {
      recent: [['publishedAt', 'DESC']],
      // Les véhicules sans tarif pour la période choisie sont toujours placés en fin de liste.
      price_asc: [[sequelize.literal(`Vehicle.${priceField} IS NULL`), 'ASC'], [priceCol, 'ASC']],
      price_desc: [[sequelize.literal(`Vehicle.${priceField} IS NULL`), 'ASC'], [priceCol, 'DESC']],
      popular: [['viewsCount', 'DESC'], ['contactsCount', 'DESC']],
    }[q.sort];

    // 1) IDs triés et paginés (jointure belongsTo uniquement → pas de sous-requête), 2) chargement complet.
    const { rows: idRows, count } = await Vehicle.findAndCountAll({
      where,
      attributes: ['id'],
      include: [{ ...activeCompany, attributes: [] }],
      order: [...order, ['id', 'DESC']],
      limit: pg.limit,
      offset: pg.offset,
    });
    const ids = idRows.map((r) => r.id);
    const full = ids.length ? await Vehicle.findAll({ where: { id: ids }, include: listInclude }) : [];
    const byId = new Map(full.map((v) => [v.id, v]));
    const rows = ids.map((id) => byId.get(id)).filter(Boolean);
    let favIds = new Set();
    if (req.user) favIds = new Set((await Favorite.findAll({ where: { userId: req.user.id, vehicleId: rows.map((r) => r.id) } })).map((f) => f.vehicleId));
    res.json(paged(rows.map((v) => ({ ...vehicles.serialize(v, { forPublic: true }), isFavorite: favIds.has(v.id) })), count, pg));
  })
);

router.get(
  '/vehicles/:id',
  ah(async (req, res) => {
    const v = await Vehicle.findOne({
      where: { id: req.params.id, ...vehicles.publicWhere() },
      include: [{ model: VehicleMedia, as: 'media' }, { model: Category, as: 'category' }, { model: Feature, as: 'features', through: { attributes: [] } }, activeCompany],
    });
    if (!v) throw AppError.notFound('Véhicule introuvable ou indisponible');

    // Comptage des consultations (1 vue par visiteur toutes les 30 minutes).
    const vh = visitor(req);
    const recent = await VehicleView.findOne({ where: { vehicleId: v.id, visitorHash: vh, createdAt: { [Op.gte]: new Date(Date.now() - 30 * 60000) } } });
    if (!recent) {
      await VehicleView.create({ vehicleId: v.id, companyId: v.companyId, visitorHash: vh });
      await Vehicle.increment('viewsCount', { where: { id: v.id } });
    }

    const similar = await Vehicle.findAll({
      where: { ...vehicles.publicWhere(), id: { [Op.ne]: v.id }, [Op.or]: [{ categoryId: v.categoryId }, { brand: v.brand }] },
      include: listInclude,
      limit: 6,
      order: [['viewsCount', 'DESC']],
    });
    const isFavorite = req.user ? Boolean(await Favorite.findOne({ where: { userId: req.user.id, vehicleId: v.id } })) : false;
    res.json({ data: { ...vehicles.serialize(v, { forPublic: true }), isFavorite, similar: similar.map((s) => vehicles.serialize(s, { forPublic: true })) } });
  })
);

/** Estimation du coût de location (durée + option chauffeur). */
router.get(
  '/vehicles/:id/quote',
  validate(Joi.object({ days: Joi.number().integer().min(1).max(pricing.MAX_DAYS).default(1), withDriver: Joi.boolean().default(false) }), 'query'),
  ah(async (req, res) => {
    const v = await Vehicle.findOne({ where: { id: req.params.id, ...vehicles.publicWhere() }, include: [activeCompany] });
    if (!v) throw AppError.notFound('Véhicule introuvable ou indisponible');
    res.json({ data: pricing.quote(v, req.validQuery) });
  })
);

/**
 * Enregistre une prise de contact et renvoie le lien direct à ouvrir
 * (WhatsApp, appel téléphonique ou email).
 */
router.post(
  '/vehicles/:id/contact',
  validate(
    Joi.object({
      channel: Joi.string().valid('whatsapp', 'phone', 'email').required(),
      name: Joi.string().trim().max(120).allow('', null),
      phone: Joi.string().trim().max(40).allow('', null),
      email: Joi.string().email().allow('', null),
      message: Joi.string().trim().max(2000).allow('', null),
      withDriver: Joi.boolean(),
      days: Joi.number().integer().min(1).max(pricing.MAX_DAYS),
    })
  ),
  ah(async (req, res) => {
    const v = await Vehicle.findOne({ where: { id: req.params.id, ...vehicles.publicWhere() }, include: [activeCompany] });
    if (!v) throw AppError.notFound('Véhicule introuvable ou indisponible');
    const general = await settings.get('general');
    const b = req.body;
    // Demande précise (durée et/ou chauffeur) → estimation calculée côté serveur.
    const q = b.days || b.withDriver !== undefined ? pricing.quote(v, { days: b.days || 1, withDriver: b.withDriver }) : null;
    const vh = visitor(req);
    // Anti-spam : un même visiteur n'est compté qu'une fois par canal et par heure.
    const dup = await ContactEvent.findOne({ where: { vehicleId: v.id, channel: b.channel, visitorHash: vh, createdAt: { [Op.gte]: new Date(Date.now() - 3600000) } } });
    if (!dup) {
      await ContactEvent.create({
        vehicleId: v.id,
        companyId: v.companyId,
        userId: req.user?.id || null,
        channel: b.channel,
        clientName: b.name || (req.user ? `${req.user.firstName} ${req.user.lastName}` : null),
        clientPhone: b.phone || req.user?.phone || null,
        clientEmail: b.email || req.user?.email || null,
        message: b.message || null,
        withDriver: q ? q.withDriver : null,
        rentalDays: b.days || null,
        estimatedTotal: q && b.days ? q.total : null,
        visitorHash: vh,
      });
      await Vehicle.increment('contactsCount', { where: { id: v.id } });
    }
    const title = `${v.brand} ${v.model}${v.year ? ` ${v.year}` : ''}`;
    let text = b.message || `Bonjour, je suis intéressé(e) par votre véhicule ${title} vu sur ${general.platformName}.`;
    if (!b.message && q) {
      const driverText = q.driverIncluded ? 'avec chauffeur (inclus)' : q.withDriver ? 'avec chauffeur' : 'sans chauffeur';
      const money = q.currency === 'USD' ? `$${q.total}` : `${q.total} ${q.currency}`;
      text += b.days
        ? ` Je souhaite le louer ${driverText} pour ${q.days} jour${q.days > 1 ? 's' : ''} (estimation ${money}).`
        : ` Je souhaite le louer ${driverText}.`;
    }
    if (!b.message) text += ' Est-il disponible ?';
    const digits = (s) => String(s || '').replace(/[^\d+]/g, '');
    const wa = digits(v.company.whatsapp || v.company.phone).replace(/^\+/, '');
    const links = {
      whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}` : null,
      phone: v.company.phone ? `tel:${digits(v.company.phone)}` : null,
      email: v.company.email ? `mailto:${v.company.email}?subject=${encodeURIComponent(`${general.platformName} — ${title}`)}&body=${encodeURIComponent(text)}` : null,
    };
    if (!links[b.channel]) throw AppError.badRequest('Ce moyen de contact n’est pas disponible pour ce propriétaire');
    res.json({ data: { url: links[b.channel], channel: b.channel } });
  })
);

router.get(
  '/companies/:id',
  ah(async (req, res) => {
    const c = await Company.findOne({ where: { id: req.params.id, status: 'active' } });
    if (!c) throw AppError.notFound('Entreprise introuvable');
    const count = await Vehicle.count({ where: { companyId: c.id, ...vehicles.publicWhere() } });
    res.json({ data: { id: c.id, name: c.name, logoUrl: mediaUrl(c.logoUrl), description: c.description, city: c.city, address: c.address, phone: c.phone, whatsapp: c.whatsapp, email: c.email, website: c.website, vehiclesCount: count } });
  })
);

/* ---------------- Favoris (client connecté) ---------------- */
const clientOnly = [authenticate, (req, res, next) => (req.user.role === ROLES.CLIENT ? next() : next(AppError.forbidden('Réservé aux clients')))];

router.get(
  '/favorites',
  ...clientOnly,
  ah(async (req, res) => {
    const favs = await Favorite.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC']] });
    const list = await Vehicle.findAll({ where: { id: favs.map((f) => f.vehicleId), ...vehicles.publicWhere() }, include: listInclude });
    const byId = Object.fromEntries(list.map((v) => [v.id, v]));
    res.json({ data: favs.map((f) => byId[f.vehicleId]).filter(Boolean).map((v) => ({ ...vehicles.serialize(v, { forPublic: true }), isFavorite: true })) });
  })
);

router.post(
  '/favorites/:vehicleId',
  ...clientOnly,
  ah(async (req, res) => {
    const v = await Vehicle.findOne({ where: { id: req.params.vehicleId, ...vehicles.publicWhere() } });
    if (!v) throw AppError.notFound('Véhicule introuvable');
    await Favorite.findOrCreate({ where: { userId: req.user.id, vehicleId: v.id } });
    res.status(201).json({ ok: true });
  })
);

router.delete(
  '/favorites/:vehicleId',
  ...clientOnly,
  ah(async (req, res) => {
    await Favorite.destroy({ where: { userId: req.user.id, vehicleId: req.params.vehicleId } });
    res.json({ ok: true });
  })
);

module.exports = router;
