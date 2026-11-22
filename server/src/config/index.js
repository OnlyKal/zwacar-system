/**
 * Configuration centralisée de l'application.
 * Toutes les variables d'environnement sont lues ici et nulle part ailleurs.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const ROOT = path.resolve(__dirname, '../..');
const env = process.env.NODE_ENV || 'development';

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    if (env === 'production') throw new Error(`Variable d'environnement manquante : ${name}`);
    return undefined;
  }
  return v;
}

const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT || 4100),
  appName: process.env.APP_NAME || 'ZwaCar',
  webUrl: process.env.WEB_URL || 'http://localhost:5180',
  apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || 4100}`,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5180')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  paths: {
    root: ROOT,
    // STORAGE_DIR permet d'isoler les fichiers (ex. tests automatisés dans un dossier temporaire).
    uploads: path.join(path.resolve(ROOT, process.env.STORAGE_DIR || 'storage'), 'uploads'),
    backups: path.join(path.resolve(ROOT, process.env.STORAGE_DIR || 'storage'), 'backups'),
    assets: path.join(ROOT, 'src/assets'),
  },

  db: {
    dialect: process.env.DB_DIALECT || 'sqlite',
    storage: path.resolve(ROOT, process.env.DB_STORAGE || 'storage/data/zwacar.sqlite'),
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'zwacar',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', env === 'test' ? 'test-access' : undefined) || 'dev-access-secret',
    refreshSecret: required('JWT_REFRESH_SECRET', env === 'test' ? 'test-refresh' : undefined) || 'dev-refresh-secret',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS || 30),
  },

  encryptionKey: required('ENCRYPTION_KEY'),

  // Documentation interactive /api/docs : désactivée par défaut en production.
  apiDocs: process.env.API_DOCS ? process.env.API_DOCS === 'true' : env !== 'production',
  // Sert le Web Admin compilé (web/dist) depuis l'API : hébergement sur un seul serveur / domaine.
  serveWeb: process.env.SERVE_WEB === 'true',
  webDist: path.resolve(ROOT, process.env.WEB_DIST || '../web/dist'),

  jobs: {
    enabled: (process.env.JOBS_ENABLED || 'true') === 'true',
    expirationsCron: process.env.CRON_EXPIRATIONS || '0 * * * *',
  },

  media: {
    minPhotos: 4,
    maxPhotos: 12,
    maxPhotoBytes: 10 * 1024 * 1024,
    maxVideoBytes: 20 * 1024 * 1024,
  },
};

/** Refuse de démarrer en production avec une configuration dangereuse. */
function assertProduction(c) {
  const errors = [];
  const weak = (s) => !s || s.length < 32 || /change-me|dev-|secret$/i.test(s);
  if (weak(c.jwt.accessSecret)) errors.push('JWT_ACCESS_SECRET trop faible (32 caractères aléatoires minimum)');
  if (weak(c.jwt.refreshSecret)) errors.push('JWT_REFRESH_SECRET trop faible (32 caractères aléatoires minimum)');
  if (c.jwt.accessSecret === c.jwt.refreshSecret) errors.push('JWT_ACCESS_SECRET et JWT_REFRESH_SECRET doivent être différents');
  if (!/^[0-9a-f]{64}$/i.test(c.encryptionKey || '')) errors.push('ENCRYPTION_KEY invalide (64 caractères hexadécimaux)');
  for (const [name, url] of [['WEB_URL', c.webUrl], ['API_URL', c.apiUrl]]) {
    if (!process.env[name]) errors.push(`${name} manquant`);
    else if (/localhost|127\.0\.0\.1/.test(url)) errors.push(`${name} ne doit pas pointer vers localhost en production`);
    else if (!url.startsWith('https://')) errors.push(`${name} doit être en HTTPS`);
  }
  if (!process.env.CORS_ORIGINS) errors.push('CORS_ORIGINS manquant (URL du Web Admin)');
  if (c.db.dialect === 'mysql' && !c.db.password) errors.push('DB_PASSWORD manquant pour MySQL');
  if (errors.length) throw new Error(`Configuration de production invalide :\n  - ${errors.join('\n  - ')}`);
}

if (config.isProd) assertProduction(config);

module.exports = config;
