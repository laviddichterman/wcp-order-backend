import logger from '../logging';
import {Promise} from 'bluebird';
import mongoose from 'mongoose';
import PACKAGE_JSON from '../package.json';
import { SEMVER } from '@wcp/wcpshared';
import { DBVersionModel } from '../models/DBVersionSchema';
import { WOptionModel } from '../models/ordering/options/WOptionSchema';

const SetVersion = async (new_version : SEMVER) => { 
  return await DBVersionModel.findOneAndUpdate({}, new_version, {new: true, upsert: true});
}

const UPGRADE_MIGRATION_FUNCTIONS = {
  "0.0.0": [{ major: 0, minor: 2, patch: 2 }, async () => { 
    {
      // move catalog_item to item in WOptionSchema
      const options_update = await WOptionSchema.updateMany(
        { catalog_item: { $exists: true }}, 
        { $rename: { "catalog_item": "item"} });
      if (options_update.modifiedCount > 0) {
        logger.debug(`Updated ${options_update.modifiedCount} Options to new catalog.`);
      }
      else {
        logger.warn("Option DB change from catalog_item to item not found");
      }
    }

    {
      // add display flags to WOptionTypeSchema
      const mt_update = await WOptionTypeSchema.updateMany(
        { display_flags: null }, 
        { $set: { 
            "display_flags.omit_section_if_no_available_options": true,
            "display_flags.omit_options_if_not_available": false,
            "display_flags.use_toggle_if_only_two_options": true
          } 
        });
      if (mt_update.modifiedCount > 0) {
        logger.debug(`Updated ${mt_update.modifiedCount} modifiers to having display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to modifier types");
      }
    }

    {
      // add display flags to WProductInstanceSchema
      const pi_update = await WProductInstanceSchema.updateMany(
        { display_flags: null }, 
        { $set: { 
            "display_flags.skip_customization": false
          } 
        });
      if (pi_update.modifiedCount > 0) {
        logger.debug(`Updated ${pi_update.modifiedCount} product instances to having display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to product instances");
      }
    }

    {
      // add display flags to WProductSchema
      const p_update = await WProductSchema.updateMany(
        { display_flags: null }, 
        { $set: { 
            "display_flags.flavor_max": 10,
            "display_flags.bake_max": 10,
            "display_flags.bake_differential": 10,
            "display_flags.show_name_of_base_product": true
          } 
        });
      if (p_update.modifiedCount > 0) {
        logger.debug(`Updated ${p_update.modifiedCount} products to having display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to products");
      }
    }

    {
      // add is_base flag to one WProductInstance
      var num_products = 0;
      const all_products = await WProductSchema.find();
      all_products.forEach(async (product) => {
        const find_base = await WProductInstanceSchema.find({ 
          "product_id": product._id,
          "is_base": true
        });
        if (find_base.length === 0) {
          const find_base = WProductInstanceSchema.findOne({ 
            "product_id": product._id
          }).sort({ "ordinal": "desc" });
          const base = await find_base;
          const update_base = await WProductInstanceSchema.findByIdAndUpdate(base._id, {"is_base": true}, {new: true});
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
      const disabled_products_find = await WProductSchema.find({ "item.disabled": true });
      var num_products = 0;
      disabled_products_find.forEach(async (product) => {
        const product_instance_disable_update = await WProductInstanceSchema.updateMany(
          { "product_id": product._id }, 
          { "item.disabled": { start: 1, end: 0 } });
        if (product_instance_disable_update.modifiedCount > 0) {
          logger.debug(`Updated from ${product_instance_disable_update.modifiedCount} product instances of ${product._id} to new blanket disable flag.`);
        }
        ++num_products;
      });
      logger.debug(`Updated total of ${num_products} product classes to having disabled product instances.`);

      const disabled_products_update = await WProductSchema.updateMany(
        { "item.disabled": true }, 
        { "item.disabled": null });
      if (disabled_products_update.modifiedCount > 0) {
        logger.debug(`Removed ${disabled_products_update.modifiedCount} disabled flags from products.`);
      }
      const product_instance_disable_update = await WProductInstanceSchema.updateMany(
        { "item.disabled": true }, 
        { "item.disabled": { start: 1, end: 0 } });
      if (product_instance_disable_update.modifiedCount > 0) {
        logger.debug(`Updated from ${product_instance_disable_update.modifiedCount} product instances to new blanket disable flag.`);
      }
      const option_disable_update = await WOptionSchema.updateMany(
        { "item.disabled": true }, 
        { "item.disabled": { start: 1, end: 0 } });
      if (option_disable_update.modifiedCount > 0) {
        logger.debug(`Updated ${option_disable_update.modifiedCount} Options to new disable flag.`);
      }
    }
  }],
  "0.2.2": [{ major: 0, minor: 2, patch: 5 }, async (dbconn) => {
    {
      // add display flags to Category
      const category_update = await WCategorySchema.updateMany(
        { display_flags: null },
        {
          $set: {
            "display_flags.call_line_name": "",
            "display_flags.call_line_display": "SHORTNAME"
          }
        });
      if (category_update.modifiedCount > 0) {
        logger.debug(`Updated ${category_update.modifiedCount} Categories to new catalog.`);
      }
      else {
        logger.warn("No categories had display_flags added");
      }
    }

    {
      // add display flags to WOptionSchema
      const option_update = await WOptionSchema.updateMany(
        { display_flags: null },
        {
          $set: {
            "display_flags.omit_from_shortname": false
          }
        });
      if (option_update.modifiedCount > 0) {
        logger.debug(`Updated ${option_update.modifiedCount} modifier options to having display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to modifier options");
      }
    }

    {
      // add display flags to WOptionTypeSchema
      const mt_update = await WOptionTypeSchema.updateMany(
        {},
        {
          $set: {
            "display_flags.hidden": false,
            "display_flags.empty_display_as": "OMIT",
            "display_flags.modifier_class": "ADD"
          }
        });
      if (mt_update.modifiedCount > 0) {
        logger.debug(`Updated ${mt_update.modifiedCount} modifiers to this version's display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to modifier types");
      }
    }

    {
      // add display flags to WProductInstanceSchema
      const pi_update = await WProductInstanceSchema.updateMany(
        {},
        {
          $set: {
            "display_flags.hide_from_menu": false,
            "display_flags.menu_adornment": "",
            "display_flags.price_display": "ALWAYS",
          }
        });
      if (pi_update.modifiedCount > 0) {
        logger.debug(`Updated ${pi_update.modifiedCount} product instances to this version's display flags.`);
      }
      else {
        logger.warn("Didn't add any display flags to product instances");
      }
    }
  }],
  "0.2.5": [{ major: 0, minor: 2, patch: 6 }, async (dbconn) => {
    {
      // update price_display flag
      const pi_update = await WProductInstanceSchema.updateMany(
        { "display_flags.price_display": "NEVER" },
        {
          $set: {
            "display_flags.price_display": "VARIES",
          }
        });
      if (pi_update.modifiedCount > 0) {
        logger.debug(`Updated ${pi_update.modifiedCount} product instances from price_display NEVER to VARIES`);
      }
      else {
        logger.warn("Didn't add any display flags to product instances");
      }
    }
    {
      // update price_display flag
      const pi_update = await WProductInstanceSchema.updateMany(
        { "display_flags.price_display": "IF_COMPLETE" },
        {
          $set: {
            "display_flags.price_display": "ALWAYS",
          }
        });
      if (pi_update.modifiedCount > 0) {
        logger.debug(`Updated ${pi_update.modifiedCount} product instances from price_display IF_COMPLETE to ALWAYS`);
      }
      else {
        logger.warn("Didn't add any display flags to product instances");
      }
    }
  }],
  "0.2.6": [{ major: 0, minor: 2, patch: 8 }, async (_dbconn) => {
  }],
  "0.2.8": [{ major: 0, minor: 2, patch: 9 }, async (dbconn) => {
    {
      // change each WProduct's modifiers list to the modifiers2 list with an empty enable function (aka always enable)
      var promises = [];
      const products = await WProductSchema.find({ "modifiers.0": { "$exists": true } });
      products.forEach(async function(product) {
        product.modifiers2 = product.modifiers.map(function(mtid) { return {mtid: mtid, enable: null}; } );
        promises.push(
        await product.save().then(function() { 
          logger.debug(`Updated product ID: ${product._id}'s modifiers.`);
        }).catch(function(err) {
          logger.error(`Unable to update product ID: ${product._id}'s modifiers. Got error: ${JSON.stringify(err)}`);
        }));
      })
      await Promise.all(promises);
    }
  }],
  "0.2.9": [{ major: 0, minor: 2, patch: 10 }, async (dbconn) => {
    {
      // copy modifiers2 to modifiers
      {
        var promises = [];
        const products = await WProductSchema.find({ "modifiers2.0": { "$exists": true } });
        products.forEach(async function(product) {
          product.modifiers = product.modifiers2;
          promises.push(
          await product.save().then(function() { 
            logger.debug(`Updated product ID: ${product._id}'s modifiers.`);
          }).catch(function(err) {
            logger.error(`Unable to update product ID: ${product._id}'s modifiers. Got error: ${JSON.stringify(err)}`);
          }));
        })
        await Promise.all(promises);
      }
      {
        // add display flag to WProductInstance
        const pi_update = await WProductInstanceSchema.updateMany(
          {},
          {
            $set: {
              "display_flags.suppress_exhaustive_modifier_list": false
            }
          });
        if (pi_update.modifiedCount > 0) {
          logger.debug(`Updated ${pi_update.modifiedCount} product instances to specify suppress_exhaustive_modifier_list to false.`);
        }
        else {
          logger.warn("Didn't add any display flags to product instances");
        }
      }
      {
        // add display flags to WOptionTypeSchema
        const mt_update = await WOptionTypeSchema.updateMany(
          {},
          {
            $set: {
              "display_flags.template_string": "",
              "display_flags.multiple_item_separator": " + ",
              "display_flags.non_empty_group_prefix": "",
              "display_flags.non_empty_group_suffix": "",
            }
          });
        if (mt_update.modifiedCount > 0) {
          logger.debug(`Updated ${mt_update.modifiedCount} modifiers to this version's display flags.`);
        }
        else {
          logger.warn("Didn't add any display flags to modifier types");
        }
      }
      {
        // add display flags to WOptionSchema part 1
        const mo_update_true = await WOptionSchema.updateMany(
          { "display_flags.omit_from_shortname": true }, 
          {
            $set: {
              "display_flags.omit_from_name": true
            }
          });
        if (mo_update_true.modifiedCount > 0) {
          logger.debug(`Updated ${mo_update_true.modifiedCount} modifier options with omit_from_shortname set to true to also have omit_from_name set to true.`);
        }
        else {
          logger.warn("Didn't add any omit_from_name: true to any modifier options");
        }
      }
      {
        // add display flags to WOptionSchema part 1
        const mo_update_false = await WOptionSchema.updateMany(
          { "display_flags.omit_from_shortname": false }, 
          {
            $set: {
              "display_flags.omit_from_name": false
            }
          });
        if (mo_update_false.modifiedCount > 0) {
          logger.debug(`Updated ${mo_update_false.modifiedCount} modifier options with omit_from_shortname set to false to also have omit_from_name set to false.`);
        }
        else {
          logger.warn("Didn't add any omit_from_name: false to any modifier options");
        }
      }
    }
  }],
  "0.2.10": [{ major: 0, minor: 2, patch: 11 }, async (dbconn) => {
    {
      // remove modifiers2
      {
        // add display flags to WOptionSchema part 1
        const p_update = await WProductSchema.updateMany(
          { },
          { $unset: { "modifiers2": "" } });
        if (p_update.modifiedCount > 0) {
          logger.debug(`Updated ${p_update.modifiedCount} WProductSchema documents to remove modifiers2 field.`);
        }
        else {
          logger.warn("Didn't remove modifiers2 from any WProductSchema documents");
        }
      }
    }
  }],
  "0.2.11": [{ major: 0, minor: 2, patch: 12 }, async (dbconn) => {
    {
      var promises = [];
      {
        //populate...
        // set modifiers.[].options.[].qualifier = "REGULAR";
        
        // display_flags.menu.ordinal
        // display_flags.menu.hide
        // display_flags.menu.price_display
        // display_flags.menu.adornment:
        // display_flags.menu.suppress_exhaustive_modifier_list
        // display_flags.menu.show_modifier_options

        // display_flags.order.ordinal
        // display_flags.order.hide
        // display_flags.order.skip_customization
        // display_flags.order.price_display
        // display_flags.order.adornment
        // display_flags.order.suppress_exhaustive_modifier_list
        const product_instances = await WProductInstanceSchema.find();
        product_instances.forEach(async function(pi) {
          pi.modifiers = pi.modifiers.map((x) => { 
            return { 
              modifier_type_id: x.modifier_type_id,
              options: x.options.map((oi) => { return { option_id: oi.option_id, placement: oi.placement, qualifier: "REGULAR" }; }) 
            };   
          });
          pi.display_flags.menu = { 
            ordinal: pi.ordinal,
            hide: pi.display_flags.hide_from_menu,
            price_display: pi.display_flags.price_display,
            adornment: pi.display_flags.menu_adornment,
            suppress_exhaustive_modifier_list: pi.display_flags.suppress_exhaustive_modifier_list,
            show_modifier_options: false            
          };
          pi.display_flags.order = { 
            ordinal: pi.ordinal,
            hide: pi.display_flags.hide_from_menu,
            skip_customization: pi.display_flags.skip_customization,
            price_display: pi.display_flags.price_display,
            adornment: pi.display_flags.menu_adornment,
            suppress_exhaustive_modifier_list: pi.display_flags.suppress_exhaustive_modifier_list
          };
          promises.push(pi.save().then(function() { 
            logger.debug(`Updated product instance ${pi.item.display_name} (${pi._id}) display flags and modifiers.`);
          }).catch(function(err) {
            logger.error(`Unable to update product instance ${pi.item.display_name} (${pi._id}) display flags and modifiers. Got error: ${JSON.stringify(err)}`);
          }));
        })
      }
      {
        // add footnotes field
        const category_update = await WCategorySchema.updateMany(
          { },
          {
            $set: {
              "footnotes": ""
            }
          });
        if (category_update.modifiedCount > 0) {
          logger.debug(`Updated ${category_update.modifiedCount} Categories to have empty footnotes.`);
        }
        else {
          logger.warn("No categories had footnotes added");
        }
      }
      {
        // create time_step2 field in SettingsSchema
        const found_services = await StringListSchema.findOne();
        const found_settings = await SettingsSchema.findOne();
        found_settings.time_step2 = found_services.services.map(()=> found_settings.time_step);
        promises.push(found_settings.save().then(function() { 
          logger.debug(`Added time_step2 settings.`);
        }).catch(function(err) {
          logger.error(`Unable to update SettingsSchema with time_step2 settings. Got error: ${JSON.stringify(err)}`);
        }));
      }
      await Promise.all(promises);
    }
  }],
  "0.2.12": [{ major: 0, minor: 2, patch: 13 }, async (_dbconn) => {
    { // do nothing
    }
  }],
  "0.2.13": [{ major: 0, minor: 2, patch: 14 }, async (_dbconn) => {
    { // do nothing
    }
  }],
  "0.2.14": [{ major: 0, minor: 2, patch: 15 }, async (_dbconn) => {
    { // do nothing
    }
  }],
  "0.2.15": [{ major: 0, minor: 2, patch: 16 }, async (_dbconn) => {
    { // do nothing
    }
  }],
  "0.2.16": [{ major: 0, minor: 2, patch: 17 }, async (_dbconn) => {
    { // do nothing
    }
  }],
  "0.2.17": [{ major: 0, minor: 2, patch: 18 }, async (_dbconn) => {
    { // do nothing
    }
  }],
  "0.2.18": [{ major: 0, minor: 2, patch: 19 }, async (dbconn) => {
    { 
      // bubble up disabled from product instances to the parent product
      {
        var product_disable_map = {};
        // time based disable find at the product instance level
        const time_disabled_pi_find = await WProductInstanceSchema.find({ "item.disabled": { start: { $gt : 1 }, end: { $gt : 2 } } });
        time_disabled_pi_find.forEach(async (pi) => {
          if (pi.product_id in product_disable_map) {
            logger.warn(`Found more than one disable value for product ${pi.product_id}, clobbering ${product_disable_map[pi.product_id]} with ${pi.item.disabled}`);
          }
          product_disable_map[pi.product_id] = pi.item.disabled;
        });
        // blanket disable find at the product instance level        
        const disabled_pi_find = await WProductInstanceSchema.find({ "item.disabled": { start : 1 , end: 0 } });
        disabled_pi_find.forEach(async (pi) => {
          if (pi.product_id in product_disable_map) {
            logger.warn(`Found more than one disable value for product ${pi.product_id}, clobbering ${product_disable_map[pi.product_id]} with ${pi.item.disabled}`);
          }
          product_disable_map[pi.product_id] = pi.item.disabled;
        });

        var promises = [];
        for (const [pid, disable] of Object.entries(product_disable_map)) {
          promises.push(WProductSchema.findByIdAndUpdate(pid,{ "disabled": disable}).then(function() { 
            logger.debug(`Updated product ${pid} with disable value ${disable}.`);
          }).catch(function(err) {
            logger.error(`Unable to update product ${pid}. Got error: ${JSON.stringify(err)}`);
          }));
        }

        // add display flags to WOptionSchema part 1
        const p_update = await WProductInstanceSchema.updateMany(
          { },
          { $unset: { "item.disabled": "" }, $set: { "service_disable": [] } });
        if (p_update.modifiedCount > 0) {
          logger.debug(`Updated ${p_update.modifiedCount} WProductInstanceSchema documents to remove item.disabled field and set empty service_disable field.`);
        }
        await Promise.all(promises);
      }
    }
  }],
  "0.2.19": [{ major: 0, minor: 2, patch: 20 }, async (dbconn) => {
    { 
      // re-assign each option_type_id in every ModifierOption
      {
        var promises = [];
        const options = await WOptionSchema.find();
        options.forEach(
          o => promises.push(WOptionSchema.findByIdAndUpdate(o._id, {option_type_id: o.option_type_id}).then(() => { 
            logger.debug(`Updated Option ${o._id} with type safe option type id ${o.option_type_id}.`);
          }).catch((err) => {
            logger.error(`Unable to Option ${o._id}. Got error: ${JSON.stringify(err)}`);
          })));
        await Promise.all(promises);
      }
      // re-assign each category_ids in every WProductSchema
      {
        var promises = [];
        const products = await WProductSchema.find();
        products.forEach(o => {
          const type_safe_cids = o.category_ids ? o.category_ids.map(cid => new mongoose.Types.ObjectId(cid)) : [];
          promises.push(WProductSchema.findByIdAndUpdate(o._id, {category_ids: type_safe_cids}).then(() => { 
            logger.debug(`Updated WProductSchema ${o._id} with type safe category ids ${type_safe_cids}.`);
          }).catch((err) => {
            logger.error(`Unable to WProductSchema ${o._id}. Got error: ${JSON.stringify(err)}`);
          }));
        });
        await Promise.all(promises);
      }    
      // re-assign each parent_id in every WCategorySchema
      {
        var promises = [];
        const cats = await WCategorySchema.find();
        cats.forEach(o => {
          promises.push(WCategorySchema.findByIdAndUpdate(o._id, {parent_id: o.parent_id}).then(() => { 
            logger.debug(`Updated WCategorySchema ${o._id} with type safe category id ${o.parent_id}.`);
          }).catch((err) => {
            logger.error(`Unable to WCategorySchema ${o._id}. Got error: ${JSON.stringify(err)}`);
          }));
        });
        await Promise.all(promises);
      }      
      // remove time_step from settings
      {
        const settings_update = await SettingsSchema.updateMany({}, {$unset: { "time_step": "" }});
        if (settings_update.modifiedCount > 0) {
          logger.debug(`Updated ${settings_update.modifiedCount} SettingsSchema documents to remove the time_step field.`);
        }
      }
    }
  }],
  "0.2.20": [{ major: 0, minor: 2, patch: 21 }, async (dbconn) => {
    { 
      // copy time_step2 to time_step in settings
      {
        const settings = await SettingsSchema.findOne();
        settings.time_step = settings.time_step2;
        await settings.save().then(function() { 
          logger.debug(`Updated settings time_step.`);
        }).catch(function(err) {
          logger.error(`Unable to update settings. Got error: ${JSON.stringify(err)}`);
        });
      }        
      // re-assign each product_id in every WProductInstanceSchema
      // migrate the price from the base product instance to the product class
      // we're going to find the base product instance for each product class and assign its price to the WProductSchema.price field
      {
        var promises = [];
        const products = Object.fromEntries((await WProductSchema.find()).map(x => [x._id, {P: x, price: 0}]));
        const pis = await WProductInstanceSchema.find();
        pis.forEach(pi => {
          products[pi.product_id].price = Math.max(products[pi.product_id].price, pi.item.price.amount);
          promises.push(WProductInstanceSchema.findByIdAndUpdate(pi._id, {product_id: pi.product_id}).then(() => { 
            logger.debug(`Updated ProductInstance ${pi._id} with type safe ProductId ${pi.product_id}.`);
          }).catch((err) => {
            logger.error(`Unable to ProductInstance ${pi._id}. Got error: ${JSON.stringify(err)}`);
          }));
        });
        Object.values(products).forEach(val=> {
          val.P.price = { amount: val.price, currency: "USD" };
          val.P.item.price = null;
          promises.push(val.P.save().then(function() { 
            logger.debug(`Updated WProduct with ID ${val.P._id} to have price \$${val.price/100}`);
          }).catch(function(err) {
            logger.error(`Unable to update WProduct with ID ${val.P._id}. Got error: ${JSON.stringify(err)}`);
          }))
        });
        await Promise.all(promises);
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

    const db_version = await this.#DBVersionSchema.find({});
    if (db_version.length > 1) {
      logger.error(`Found more than one DB version entry: ${JSON.stringify(db_version)}, deleting all.`);
      await this.#DBVersionSchema.deleteMany({});
    }
    else if (db_version.length === 1) {
      current_db_version = `${db_version[0].major}.${db_version[0].minor}.${db_version[0].patch}`;
    }

    // run update loop
    while (PACKAGE_JSON.version !== current_db_version) {
      if (current_db_version in UPGRADE_MIGRATION_FUNCTIONS) {
        const [next_ver, migration_function] = UPGRADE_MIGRATION_FUNCTIONS[current_db_version];
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