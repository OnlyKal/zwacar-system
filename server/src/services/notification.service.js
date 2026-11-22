/**
 * Notifications internes affichées dans le Web Admin (cloche de la barre supérieure).
 * Une notification n'empêche jamais l'opération qui la déclenche : les erreurs sont journalisées.
 */
const { UniqueConstraintError } = require('sequelize');
const { Notification, User } = require('../models');
const { ROLES } = require('../utils/constants');

/**
 * Notifie tous les Super Administrateurs actifs.
 * @param n { type, title, message?, link?, companyId?, dedupeKey? }
 */
async function notifySuperAdmins(n) {
  try {
    const admins = await User.findAll({ where: { role: ROLES.SUPER_ADMIN, status: 'active' }, attributes: ['id'] });
    for (const a of admins) {
      try {
        await Notification.create({ ...n, userId: a.id });
      } catch (e) {
        if (!(e instanceof UniqueConstraintError)) throw e; // doublon (même dedupeKey) : ignoré
      }
    }
  } catch (e) {
    console.error('[notifications]', e.message);
  }
}

module.exports = { notifySuperAdmins };
