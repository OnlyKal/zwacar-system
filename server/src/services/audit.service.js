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

/**
 * Vue « entreprise » du journal : les actions du Super Administrateur apparaissent comme
 * « Administration <plateforme> », sans identité, email, adresse IP ni métadonnées techniques.
 */
function maskForCompany(rows, platformName = 'ZwaCar') {
  return rows.map((r) => {
    const j = r.toJSON ? r.toJSON() : { ...r };
    if (j.user?.role === 'super_admin') {
      j.user = { id: null, firstName: 'Administration', lastName: platformName, email: null, role: 'super_admin' };
      j.userId = null;
      j.ip = null;
      j.userAgent = null;
      j.metadata = null;
    }
    return j;
  });
}

module.exports = {
  maskForCompany, log };
