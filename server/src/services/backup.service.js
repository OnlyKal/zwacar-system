/**
 * Sauvegarde et restauration de la base de données.
 *
 * Format : JSON portable (toutes les tables), indépendant du dialecte —
 * une sauvegarde SQLite peut être restaurée sur MySQL et inversement.
 * Les médias (storage/uploads) sont à sauvegarder séparément au niveau du système de fichiers.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const config = require('../config');
const models = require('../models');
const settings = require('./settings.service');
const { AppError } = require('../utils/helpers');

// Ordre respectant les dépendances (parents avant enfants)
const ORDER = [
  'Setting',
  'Company',
  'User',
  'Category',
  'Feature',
  'PaymentMethod',
  'Vehicle',
  'VehicleMedia',
  'VehicleFeature',
  'VehicleEvent',
  'VehicleView',
  'ContactEvent',
  'Favorite',
  'Payment',
  'CreditTransaction',
  'AuditLog',
  'EmailLog',
];
// Jetons de session non sauvegardés : une restauration déconnecte tout le monde.
const SKIP = ['RefreshToken', 'ActionToken'];

const DIR = config.paths.backups;
const safeName = (name) => {
  if (!/^zwacar-backup-[\w-]+\.json\.gz$/.test(name)) throw AppError.badRequest('Nom de sauvegarde invalide');
  return path.join(DIR, name);
};

async function create(label = 'manual') {
  await fsp.mkdir(DIR, { recursive: true });
  const data = {};
  for (const name of ORDER) data[name] = await models[name].findAll({ raw: true });
  const payload = { app: 'zwacar', version: 1, dialect: models.sequelize.getDialect(), createdAt: new Date().toISOString(), label, tables: data };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `zwacar-backup-${stamp}-${label.replace(/[^\w]/g, '')}.json.gz`;
  await fsp.writeFile(path.join(DIR, file), zlib.gzipSync(JSON.stringify(payload)));
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return { file, counts };
}

async function list() {
  await fsp.mkdir(DIR, { recursive: true });
  const files = (await fsp.readdir(DIR)).filter((f) => f.endsWith('.json.gz'));
  const out = await Promise.all(
    files.map(async (f) => {
      const st = await fsp.stat(path.join(DIR, f));
      return { file: f, size: st.size, createdAt: st.mtime };
    })
  );
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

const filePath = (name) => safeName(name);

async function remove(name) {
  await fsp.unlink(safeName(name));
}

function parse(buffer) {
  let json;
  try {
    const raw = buffer[0] === 0x1f && buffer[1] === 0x8b ? zlib.gunzipSync(buffer) : buffer;
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    throw AppError.badRequest('Fichier de sauvegarde illisible');
  }
  if (json.app !== 'zwacar' || !json.tables) throw AppError.badRequest('Ce fichier n’est pas une sauvegarde ZwaCar');
  return json;
}

/** Restaure intégralement une sauvegarde (opération destructive, exécutée dans une transaction). */
async function restore(buffer) {
  const json = parse(buffer);
  // Sauvegarde de sécurité automatique avant restauration
  const safety = await create('pre-restore');
  const { sequelize } = models;
  const isSqlite = sequelize.getDialect() === 'sqlite';

  // SQLite : le PRAGMA ne peut pas changer dans une transaction (connexion unique) → avant/après.
  // MySQL : FOREIGN_KEY_CHECKS est propre à la connexion → positionné DANS la transaction ;
  // DELETE plutôt que TRUNCATE, qui validerait implicitement la transaction (restauration non atomique).
  if (isSqlite) await sequelize.query('PRAGMA foreign_keys = OFF');
  try {
    await sequelize.transaction(async (t) => {
      if (!isSqlite) await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t });
      try {
        for (const name of [...ORDER, ...SKIP].reverse()) {
          await models[name].destroy({ where: {}, transaction: t });
        }
        for (const name of ORDER) {
          const rows = json.tables[name] || [];
          for (let i = 0; i < rows.length; i += 500) {
            await models[name].bulkCreate(rows.slice(i, i + 500), { transaction: t, validate: false, hooks: false });
          }
        }
      } finally {
        if (!isSqlite) await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t });
      }
    });
  } finally {
    if (isSqlite) await sequelize.query('PRAGMA foreign_keys = ON');
    settings.clearCache();
  }
  return { restoredFrom: json.createdAt, safetyBackup: safety.file, counts: Object.fromEntries(Object.entries(json.tables).map(([k, v]) => [k, v.length])) };
}

module.exports = { create, list, filePath, remove, restore };
