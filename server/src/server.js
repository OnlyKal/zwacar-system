/**
 * Point d'entrée : connexion base de données, synchronisation du schéma, serveur HTTP, tâches planifiées.
 */
const config = require('./config');
const { sequelize } = require('./models');
const app = require('./app');
const jobs = require('./jobs/scheduler');
const { syncSchema } = require('./scripts/sync');

async function main() {
  await sequelize.authenticate();
  await syncSchema();
  const server = app.listen(config.port, () => {
    console.log(`[server] ${config.appName} API — http://localhost:${config.port}/api (docs : /api/docs) — base : ${config.db.dialect}`);
  });
  jobs.start();

  const shutdown = (sig) => {
    console.log(`[server] ${sig} reçu, arrêt…`);
    jobs.stop();
    server.close(() => sequelize.close().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('[server] démarrage impossible', e);
  process.exit(1);
});
