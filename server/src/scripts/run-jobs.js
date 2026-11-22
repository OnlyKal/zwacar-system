/**
 * Exécution manuelle du traitement des expirations (utile en cron système / CI).
 *   npm run jobs:run
 */
const { sequelize } = require('../models');
const jobs = require('../jobs/scheduler');

jobs
  .runExpirations('cli')
  .then(async (r) => {
    console.log('[jobs]', r);
    await new Promise((res) => setTimeout(res, 1500));
    await sequelize.close();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
