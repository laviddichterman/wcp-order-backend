const logger = require('../logging');
const PACKAGE_JSON = require('../package.json');

const SetVersion = async (dbconn, new_version) => { 
  return await dbconn.DBVersionSchema.findOneAndUpdate({}, new_version);
}

MIGRATION_FUNCTIONS = {
  "NONE": async (dbconn) => { 
    // for any products with an item, move the name 
    const products_update = await dbconn.WProductSchema.updateMany(
      { "item.display_name": { $exists: true }}, 
      { $rename: { "item.display_name": "name"} });
    if (products_update.nModified > 0) {
      logger.debug(`Updated ${products_update.nModified} products to new catalog.`);
      await this.SyncProducts();
    }
    else {
      logger.info("Product DB already migrated");
    }
    // move catalog_item to item in WOptionSchema
    const options_update = await this.#dbconn.WOptionSchema.updateMany(
      { catalog_item: { $exists: true }}, 
      { $rename: { "catalog_item": "item"} });
    if (options_update.nModified > 0) {
      logger.debug(`Updated ${options_update.nModified} Options to new catalog.`);
      await this.SyncOptions();
    }
    else {
      logger.info("Option DB already migrated");
    }

    //TODO: change disabled flag from bool to numbers
    SetVersion(dbconn, { major: 0, minor: 2, patch: 0 });
  }
}

class DatabaseManager {
  #dbconn;
  constructor(dbconn) {
    this.#dbconn = dbconn;
  }



  Bootstrap = async () => {
    const [VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH] = PACKAGE_JSON.version.split(".", 3).map(x => parseInt(x));
    const VERSION_PACKAGE = { major: VERSION_MAJOR, minor: VERSION_MINOR, patch: VERSION_PATCH };

    // load version from the DB, run update loop
    logger.info("Running database upgrade bootstrap.");

    const db_version = await this.#dbconn.DBVersionSchema.find({});
    if (db_version.length !== 1) {
      this.##dbconn
    }
    logger.info("Loading ...");

    await this.SyncCategories();

    await this.SyncModifierTypes();
    
    await this.SyncOptions();
    
    await this.SyncProducts();

    await this.SyncProductInstances();

    await this.CatalogMigrate();

    this.RecomputeCatalog();
  };


}

module.exports = ({ dbconn, socketRO, socketAUTH }) => {
  return new CatalogProvider(dbconn, socketRO, socketAUTH);
}