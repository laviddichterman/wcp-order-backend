const logger = require('../logging');
const PACKAGE_JSON = require('../package.json');

const SetVersion = async (dbconn, new_version) => { 
  return await dbconn.DBVersionSchema.findOneAndUpdate({}, new_version, {useFindAndModify: false, new: true, upsert: true});
}

MIGRATION_FUNCTIONS = {
  "0.0.0": [{ major: 0, minor: 2, patch: 0 }, async (dbconn) => { 
    // for any products with an item, move the name 
    const products_update = await dbconn.WProductSchema.updateMany(
      { "item.display_name": { $exists: true }}, 
      { $rename: { "item.display_name": "name"},
        $unset: { item: "" }
     });
    if (products_update.nModified > 0) {
      logger.debug(`Updated ${products_update.nModified} products to new catalog.`);
    }
    else {
      logger.info("Product DB already migrated");
    }
    // move catalog_item to item in WOptionSchema
    const options_update = await dbconn.WOptionSchema.updateMany(
      { catalog_item: { $exists: true }}, 
      { $rename: { "catalog_item": "item"} });
    if (options_update.nModified > 0) {
      logger.debug(`Updated ${options_update.nModified} Options to new catalog.`);
    }
    else {
      logger.info("Option DB already migrated");
    }

    // //TODO: change disabled flag from bool to numbers
    // const products_update = await dbconn.WProductSchema.updateMany(
    //   { "item.display_name": { $exists: true }}, 
    //   { $rename: { "item.display_name": "name"} });
    // if (products_update.nModified > 0) {
    //   logger.debug(`Updated ${products_update.nModified} products to new catalog.`);
    //   await this.SyncProducts();
    // }
  }]
}

class DatabaseManager {
  #dbconn;
  constructor(dbconn) {
    this.#dbconn = dbconn;
  }

  Bootstrap = async (cb) => {
    const [VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH] = PACKAGE_JSON.version.split(".", 3).map(x => parseInt(x));
    const VERSION_PACKAGE = { major: VERSION_MAJOR, minor: VERSION_MINOR, patch: VERSION_PATCH };

    // load version from the DB
    logger.info("Running database upgrade bootstrap.");

    var current_db_version = "0.0.0";

    const db_version = await this.#dbconn.DBVersionSchema.find({});
    if (db_version.length > 1) {
      logger.error(`Found more than one DB version entry: ${JSON.stringify(db_version)}, deleting all.`);
      await this.#dbconn.DBVersionSchema.deleteMany({});
    }
    else if (db_version.length === 1) {
      current_db_version = `${db_version[0].major}.${db_version[0].minor}.${db_version[0].patch}`;
    }

    // run update loop
    while (PACKAGE_JSON.version !== current_db_version) {
      if (current_db_version in MIGRATION_FUNCTIONS) {
        const [next_ver, migration_function] = MIGRATION_FUNCTIONS[current_db_version];
        const next_ver_string = `${next_ver.major}.${next_ver.minor}.${next_ver.patch}`;
        logger.info(`Running migration function from ${current_db_version} to ${next_ver_string}`);
        await migration_function(this.#dbconn);
        await SetVersion(this.#dbconn, next_ver);
        current_db_version = next_ver_string;
      }
      else {
        logger.warn(`No explicit migration from ${current_db_version} to ${PACKAGE_JSON.version}, setting to new version.`);
        await SetVersion(this.#dbconn, VERSION_PACKAGE);
        current_db_version = PACKAGE_JSON.version;
      }
    }

    logger.info("Database upgrade checks completed.");
    if (cb) {
      return await cb();
    }
  };


}

module.exports = ({ dbconn }) => {
  return new DatabaseManager(dbconn);
}