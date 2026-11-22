/**
 * Connexion Sequelize — SQLite en développement, MySQL en production.
 * Le code applicatif est identique pour les deux dialectes.
 */
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const config = require('./index');

let sequelize;

if (config.db.dialect === 'mysql') {
  sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
    host: config.db.host,
    port: config.db.port,
    dialect: 'mysql',
    logging: false,
    timezone: '+00:00',
    pool: { max: 10, min: 0, idle: 10000 },
    define: { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  });
} else {
  const storage = config.db.storage;
  fs.mkdirSync(path.dirname(storage), { recursive: true });
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage,
    logging: false,
    // SQLite sérialise les écritures : évite les erreurs SQLITE_BUSY sous charge.
    retry: { max: 5 },
  });
}

module.exports = sequelize;
