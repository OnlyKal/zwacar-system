/**
 * Tâches planifiées (node-cron) :
 *  - Expirations / renouvellements automatiques / rappels avant expiration (toutes les heures par défaut)
 *  - Sauvegarde quotidienne de la base (02:00) avec rotation (14 dernières conservées)
 *  - Nettoyage des jetons expirés (03:00)
 *  - Vérification des paiements en ligne FlexPay en attente (toutes les 2 minutes)
 *
 * Les opérations de crédits sont idempotentes : une exécution concurrente (plusieurs instances,
 * relance manuelle) ne peut pas provoquer de double débit.
 */
const cron = require('node-cron');
const { Op } = require('sequelize');
const config = require('../config');
const { RefreshToken, ActionToken } = require('../models');

const state = { running: false, lastRun: null, lastResult: null, lastError: null, nextBackup: '02:00', tasks: [] };

async function runExpirations(trigger = 'cron') {
  if (state.running) return { skipped: true, reason: 'Exécution déjà en cours' };
  state.running = true;
  const vehicles = require('../services/vehicle.service');
  try {
    const reminders = await vehicles.sendExpiryReminders();
    const r = await vehicles.processExpirations();
    state.lastResult = { trigger, reminders, ...r };
    state.lastError = null;
    if (r.processed || reminders) console.log('[jobs] expirations', state.lastResult);
    return state.lastResult;
  } catch (e) {
    state.lastError = e.message;
    console.error('[jobs] expirations', e);
    throw e;
  } finally {
    state.running = false;
    state.lastRun = new Date();
  }
}

async function dailyBackup() {
  const backup = require('../services/backup.service');
  const fsp = require('fs').promises;
  const path = require('path');
  await backup.create('auto');
  const autos = (await backup.list()).filter((b) => b.file.endsWith('-auto.json.gz'));
  for (const old of autos.slice(14)) await fsp.unlink(path.join(config.paths.backups, old.file)).catch(() => {});
}

async function cleanupTokens() {
  const now = new Date();
  await RefreshToken.destroy({ where: { [Op.or]: [{ expiresAt: { [Op.lt]: now } }, { revokedAt: { [Op.lt]: new Date(now - 7 * 86400000) } }] } });
  await ActionToken.destroy({ where: { [Op.or]: [{ expiresAt: { [Op.lt]: now } }, { usedAt: { [Op.ne]: null } }] } });
}

let syncingPayments = false;
/** Relit auprès du fournisseur les paiements en ligne en attente (callback manqué, serveur local…). */
async function syncOnlinePayments() {
  if (syncingPayments) return { skipped: true };
  syncingPayments = true;
  try {
    const r = await require('../services/payment/payment.service').syncPendingOnline();
    if (r.completed || r.failed || r.expired) console.log('[jobs] paiements en ligne', r);
    return r;
  } finally {
    syncingPayments = false;
  }
}

function start() {
  if (!config.jobs.enabled || config.isTest) return;
  const safe = (name, fn) => () => fn().catch((e) => console.error(`[jobs] ${name}`, e.message));
  state.tasks = [
    cron.schedule(config.jobs.expirationsCron, safe('expirations', () => runExpirations('cron'))),
    cron.schedule('0 2 * * *', safe('backup', dailyBackup)),
    cron.schedule('0 3 * * *', safe('cleanup', cleanupTokens)),
    cron.schedule('*/2 * * * *', safe('payments', syncOnlinePayments)),
  ];
  // Rattrapage au démarrage (serveur arrêté pendant une échéance).
  setTimeout(safe('expirations', () => runExpirations('startup')), 5000);
  console.log(`[jobs] planificateur démarré (expirations : "${config.jobs.expirationsCron}")`);
}

function stop() {
  state.tasks.forEach((t) => t.stop());
  state.tasks = [];
}

const status = () => ({ enabled: config.jobs.enabled, cron: config.jobs.expirationsCron, running: state.running, lastRun: state.lastRun, lastResult: state.lastResult, lastError: state.lastError });

module.exports = { start, stop, runExpirations, dailyBackup, cleanupTokens, syncOnlinePayments, status };
