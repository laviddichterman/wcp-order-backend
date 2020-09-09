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
      const all_products = await dbconn.WProductSchema.find();
      all_products.forEach(async (product) => {
        const find_base = await dbconn.WProductInstanceSchema.find({ 
          "product_id": product._id,
          "is_base": true
        });
        if (find_base.length === 0) {
          const find_base = dbconn.WProductInstanceSchema.findOne({ 
            "product_id": product._id
          }).sort({ "ordinal": "desc" });
          const base = await find_base;
          const update_base = await dbconn.WProductInstanceSchema.findByIdAndUpdate(base._id, {"is_base": true}, {new: true});
          if (update_base.is_base) {
            ++num_products;
            logger.debug(`Updated is_base for ${product._id}.`);
          }
          
        }
      });
      logger.debug(`Updated total of ${num_products} product instances to having an is_base flag.`);
    }
    // change disabled flag from bool to numbers
    // remove product class disables, moving them to the related instances
    {
      // disabling at the product level is depreciated, so we disable the instances
      const disabled_products_find = await dbconn.WProductSchema.find({ "item.disabled": true });
      var num_products = 0;
      disabled_products_find.forEach(async (product) => {
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
  "0.2.2": [{ major: 0, minor: 2, patch: 5 }, async (dbconn) => { 
    {
      // add display flags to Category
      const category_update = await dbconn.WCategorySchema.updateMany(
        { display_flags: null }, 
        { $set: { 
            "display_flags.call_line_name": "",
            "display_flags.call_line_display": "SHORTNAME"
          } 
        });
      if (category_update.nModified > 0) {
        logger.debug(`Updated ${category_update.nModified} Categories to new catalog.`);
      }
      else {
        logger.warn("No categories had display_flags added");
      }
    }

    {
      // add display flags to WOptionSchema
      const option_update = await dbconn.WOptionSchema.updateMany(
        { display_flags: null }, 
        { $set: { 
            "display_flags.omit_from_shortname": false
          } 
        });
      if (option_update.nModified > 0) {
        logger.debug(`Updated ${option_update.nModified} modifier options to having display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to modifier options");
      }
    }

    {
      // add display flags to WOptionTypeSchema
      const mt_update = await dbconn.WOptionTypeSchema.updateMany(
        { }, 
        { $set: { 
            "display_flags.hidden": false,
            "display_flags.empty_display_as": "OMIT",
            "display_flags.modifier_class": "ADD"
          } 
        });
      if (mt_update.nModified > 0) {
        logger.debug(`Updated ${mt_update.nModified} modifiers to this version's display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to modifier types");
      }
    }

    {
      // add display flags to WProductInstanceSchema
      const pi_update = await dbconn.WProductInstanceSchema.updateMany(
        { }, 
        { $set: { 
            "display_flags.hide_from_menu": false,
            "display_flags.menu_adornment": "",
            "display_flags.price_display": "ALWAYS",
          } 
        });
      if (pi_update.nModified > 0) {
        logger.debug(`Updated ${pi_update.nModified} product instances to this version's display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to product instances");
      }
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