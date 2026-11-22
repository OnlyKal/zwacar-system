/**
 * PM2 — démarrage et redémarrage automatique de l'API ZwaCar.
 *   cd server && pm2 start ../deploy/ecosystem.config.cjs && pm2 save && pm2 startup
 * Une seule instance : les tâches planifiées (renouvellements, paiements, sauvegardes) ne doivent tourner qu'une fois.
 */
module.exports = {
  apps: [
    {
      name: 'zwacar-api',
      cwd: __dirname + '/../server',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
      kill_timeout: 12000,
      time: true,
    },
  ],
};
