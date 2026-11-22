/**
 * Synchronisation non destructive du schéma (SQLite et MySQL) :
 *  1. crée les tables manquantes ;
 *  2. ajoute les colonnes manquantes des tables existantes.
 * Aucune colonne ni donnée n'est jamais supprimée ou modifiée.
 */
const { sequelize } = require('../models');

async function syncSchema() {
  const qi = sequelize.getQueryInterface();
  await sequelize.sync();
  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    const existing = await qi.describeTable(table);
    for (const [name, attr] of Object.entries(model.getAttributes())) {
      const column = attr.field || name;
      if (existing[column]) continue;
      const def = { type: attr.type, allowNull: attr.allowNull !== false || attr.defaultValue === undefined, defaultValue: attr.defaultValue };
      await qi.addColumn(table, column, def);
      console.log(`[db] colonne ajoutée : ${table}.${column}`);
      // Migration : les véhicules déjà marqués « avec chauffeur » passent en « chauffeur inclus ».
      if (table === 'vehicles' && column === 'driver_mode') {
        await sequelize.query("UPDATE vehicles SET driver_mode = 'included' WHERE with_driver = 1");
      }
    }
  }
  if (sequelize.getDialect() === 'sqlite') await sequelize.query('PRAGMA journal_mode = WAL');
}

module.exports = { syncSchema };

if (require.main === module) {
  syncSchema()
    .then(() => {
      console.log('[db] schéma synchronisé');
      return sequelize.close();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
