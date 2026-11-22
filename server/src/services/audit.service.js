/**
 * Journalisation des opérations sensibles (journal d'activité).
 * Ne lève jamais d'exception : un échec de log ne doit pas casser l'opération métier.
 */
const { AuditLog } = require('../models');
const { clientIp } = require('../utils/helpers');

async function log(req, action, { entityType, entityId, description, metadata, companyId, userId } = {}) {
  try {
    await AuditLog.create({
      userId: userId ?? req?.user?.id ?? null,
      companyId: companyId ?? req?.user?.companyId ?? null,
      action,
      entityType,
      entityId: entityId != null ? String(entityId) : null,
      description: description ? String(description).slice(0, 255) : null,
      metadata: metadata || null,
      ip: req ? clientIp(req) : 'system',
      userAgent: req?.headers?.['user-agent']?.slice(0, 255) || (req ? null : 'scheduler'),
    });
  } catch (e) {
    console.error('[audit] échec', action, e.message);
  }
}

module.exports = { log };
