/**
 * /api/notifications — notifications internes de l'utilisateur connecté.
 */
const router = require('express').Router();
const { Op } = require('sequelize');
const { Notification } = require('../models');
const { authenticate, backOffice } = require('../middleware/auth');
const { ah, paginate, paged } = require('../utils/helpers');

router.use(authenticate, backOffice);

router.get(
  '/',
  ah(async (req, res) => {
    const pg = paginate(req.query, 15);
    const where = { userId: req.user.id };
    if (req.query.unread === '1') where.readAt = null;
    const { rows, count } = await Notification.findAndCountAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: pg.limit, offset: pg.offset });
    const unread = await Notification.count({ where: { userId: req.user.id, readAt: null } });
    res.json({ ...paged(rows, count, pg), unread });
  })
);

router.post(
  '/read-all',
  ah(async (req, res) => {
    await Notification.update({ readAt: new Date() }, { where: { userId: req.user.id, readAt: null } });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/read',
  ah(async (req, res) => {
    // Filtré par utilisateur : impossible de modifier la notification d'un autre.
    await Notification.update({ readAt: new Date() }, { where: { id: req.params.id, userId: req.user.id, readAt: { [Op.is]: null } } });
    res.json({ ok: true });
  })
);

module.exports = router;
