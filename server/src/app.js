/**
 * Application Express : sécurité, routes et gestion des erreurs.
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/common');
const companies = require('./modules/companies.routes');
const wallet = require('./modules/wallet.routes');
const platform = require('./modules/platform.routes');
const openapi = require('./docs/openapi');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // médias consommés par le web et le mobile
    contentSecurityPolicy: false, // API JSON + Swagger UI
  })
);
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) || !config.isProd),
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

// Limitation globale anti-abus
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: config.isTest ? 100000 : 300, standardHeaders: true, legacyHeaders: false }));

// Médias publics (noms aléatoires, images ré-encodées)
app.use('/uploads', express.static(config.paths.uploads, { maxAge: '30d', fallthrough: false, index: false, dotfiles: 'deny' }));

// Santé : utilisé par l'hébergeur / le superviseur (vérifie aussi la base de données).
app.get('/api/health', async (req, res) => {
  try {
    await require('./models').sequelize.query('SELECT 1');
    res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', database: 'unreachable', time: new Date().toISOString() });
  }
});
if (config.apiDocs) app.get('/api/docs.json', (req, res) => res.json(openapi()));
if (config.apiDocs) app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(null, { swaggerOptions: { url: '/api/docs.json' }, customSiteTitle: `${config.appName} API` }));

app.use('/api/auth', require('./modules/auth.routes'));
app.use('/api/public', require('./modules/public.routes'));
app.use('/api/companies', companies.admin);
app.use('/api/company', companies.own);
app.use('/api/users', require('./modules/users.routes'));
app.use('/api/vehicles', require('./modules/vehicles.routes'));
app.use('/api/wallet', wallet.walletRouter);
app.use('/api/payments', wallet.paymentsRouter);
app.use('/api/payment-methods', wallet.methodsRouter);
app.use('/api/catalog', platform.catalog);
app.use('/api/contacts', platform.contacts);
app.use('/api/settings', platform.settingsRouter);
app.use('/api/stats', platform.statsRouter);
app.use('/api/audit', platform.auditRouter);
app.use('/api/backups', platform.backups);
app.use('/api/jobs', platform.jobsRouter);
app.use('/api/reports', require('./modules/reports.routes'));
app.use('/api/notifications', require('./modules/notifications.routes'));

// Web Admin compilé servi par l'API (option SERVE_WEB=true) : un seul serveur, un seul domaine.
if (config.serveWeb) {
  const fs = require('fs');
  const path = require('path');
  const index = path.join(config.webDist, 'index.html');
  if (!fs.existsSync(index)) throw new Error(`SERVE_WEB=true mais ${index} est introuvable (exécutez « npm run build » dans web/)`);
  app.use(express.static(config.webDist, { index: false, maxAge: '7d', setHeaders: (res, file) => file.endsWith('.html') && res.setHeader('Cache-Control', 'no-cache') }));
  // Repli SPA : toute route non-API renvoie l'application.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
