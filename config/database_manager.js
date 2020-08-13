const logger = require('../logging');
const PACKAGE_JSON = require('../package.json');

const SetVersion = async (dbconn, new_version) => { 
  return await dbconn.DBVersionSchema.findOneAndUpdate({}, new_version, {new: true, upsert: true});
}

MIGRATION_FUNCTIONS = {
  "0.0.0": [{ major: 0, minor: 2, patch: 2 }, async (dbconn) => { 
    {
      // move catalog_item to item in WOptionSchema
      const options_update = await dbconn.WOptionSchema.updateMany(
        { catalog_item: { $exists: true }}, 
        { $rename: { "catalog_item": "item"} });
      if (options_update.nModified > 0) {
        logger.debug(`Updated ${options_update.nModified} Options to new catalog.`);
      }
      else {
        logger.warn("Option DB change from catalog_item to item not found");
      }
    }

    {
      // add display flags to WOptionTypeSchema
      const mt_update = await dbconn.WOptionTypeSchema.updateMany(
        { display_flags: null }, 
        { $set: { 
            "display_flags.omit_section_if_no_available_options": true,
            "display_flags.omit_options_if_not_available": false,
            "display_flags.use_toggle_if_only_two_options": true
          } 
        });
      if (mt_update.nModified > 0) {
        logger.debug(`Updated ${mt_update.nModified} modifiers to having display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to modifier types");
      }
    }

    {
      // add display flags to WProductInstanceSchema
      const pi_update = await dbconn.WProductInstanceSchema.updateMany(
        { display_flags: null }, 
        { $set: { 
            "display_flags.skip_customization": false
          } 
        });
      if (pi_update.nModified > 0) {
        logger.debug(`Updated ${pi_update.nModified} product instances to having display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to product instances");
      }
    }

    {
      // add display flags to WProductSchema
      const p_update = await dbconn.WProductSchema.updateMany(
        { display_flags: null }, 
        { $set: { 
            "display_flags.flavor_max": 10,
            "display_flags.bake_max": 10,
            "display_flags.bake_differential": 10,
            "display_flags.show_name_of_base_product": true
          } 
        });
      if (p_update.nModified > 0) {
        logger.debug(`Updated ${p_update.nModified} products to having display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to products");
      }
    }

    {
      // add is_base flag to one WProductInstance
      var num_products = 0;
      const all_products = await this.#dbconn.WProductSchema.find();
      all_products.forEach((product) => {
        const find_base = await dbconn.WProductInstanceSchema.findOne({ 
          "product_id": product._id,
          "is_base": true
        });
        if (find_base.length === 0) {
          const find_lowest = this.#dbconn.WProductInstanceSchema.findOne({ 
            "product_id": product._id
          }).sort({ "ordinal": "asc" });
          const lowest = await find_lowest;
          const update_lowest = this.#dbconn.WProductInstanceSchema.findByIdAndUpdate(lowest._id, {"is_base": true});;
          ++num_products;
        }
      });
      logger.debug(`Updated total of ${num_products} product instances to having an is_base flag.`);
    }


//  TODO: add is_base to the first product instance found

    // change disabled flag from bool to numbers
    // remove product class disables, moving them to the related instances
    {
      // disabling at the product level is depreciated, so we disable the instances
      const disabled_products_find = await this.#dbconn.WProductSchema.find({ "item.disabled": true });
      var num_products = 0;
      disabled_products_find.forEach((product) => {
        const product_instance_disable_update = await dbconn.WProductInstanceSchema.updateMany(
          { "product_id": product._id }, 
          { "item.disabled": { start: 1, end: 0 } });
        if (product_instance_disable_update.nModified > 0) {
          logger.debug(`Updated from ${product_instance_disable_update.nModified} product instances of ${product._id} to new blanket disable flag.`);
        }
        ++num_products;
      });
      logger.debug(`Updated total of ${num_products} product classes to having disabled product instances.`);

      const disabled_products_update = await dbconn.WProductSchema.updateMany(
        { "item.disabled": true }, 
        { "item.disabled": null });
      if (disabled_products_update.nModified > 0) {
        logger.debug(`Removed ${disabled_products_update.nModified} disabled flags from products.`);
      }
      const product_instance_disable_update = await dbconn.WProductInstanceSchema.updateMany(
        { "item.disabled": true }, 
        { "item.disabled": { start: 1, end: 0 } });
      if (product_instance_disable_update.nModified > 0) {
        logger.debug(`Updated from ${product_instance_disable_update.nModified} product instances to new blanket disable flag.`);
      }
      const option_disable_update = await dbconn.WOptionSchema.updateMany(
        { "item.disabled": true }, 
        { "item.disabled": { start: 1, end: 0 } });
      if (option_disable_update.nModified > 0) {
        logger.debug(`Updated ${option_disable_update.nModified} Options to new disable flag.`);
      }
    }
  }],
  "0.2.1": [{ major: 0, minor: 2, patch: 2 }, async (dbconn) => { 
    // for any products with an item, move the name
    const products_update = await dbconn.WProductSchema.updateMany(
      { "name": { $exists: true }}, 
      { $rename: { "name": "item.display_name"},
     });
    if (products_update.nModified > 0) {
      logger.debug(`Updated ${products_update.nModified} products to new catalog.`);
    }
    else {
      logger.info("Product DB already migrated");
    }

    // change disabled flag from bool to numbers
    const products_disable_update = await dbconn.WProductSchema.updateMany(
      { "item.disabled": true }, 
      { "item.disabled": { start: 1, end: 0 } });
    if (products_disable_update.nModified > 0) {
      logger.debug(`Updated ${products_disable_update.nModified} products to new disabled flag.`);
    }
    else {
      logger.info("Product DB already migrated");
    }
    const product_instance_disable_update = await dbconn.WProductInstanceSchema.updateMany(
      { "item.disabled": true }, 
      { "item.disabled": { start: 1, end: 0 } });
    if (product_instance_disable_update.nModified > 0) {
      logger.debug(`Updated ${product_instance_disable_update.nModified} product instances to new disable flag.`);
    }
    const option_disable_update = await dbconn.WOptionSchema.updateMany(
      { "item.disabled": true }, 
      { "item.disabled": { start: 1, end: 0 } });
    if (option_disable_update.nModified > 0) {
      logger.debug(`Updated ${option_disable_update.nModified} Options to new disable flag.`);
    }
  }],

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