import logger from '../logging';
import { WProvider } from '../types/WProvider';
import PACKAGE_JSON from '../../package.json';
import { OptionPlacement, OptionQualifier, ReduceArrayToMapByKey, SEMVER, WDateUtils } from '@wcp/wcpshared';
import DBVersionModel from '../models/DBVersionSchema';
import { KeyValueModel } from '../models/settings/KeyValueSchema';
import { WMoney } from '../models/WMoney';
import { IntervalSchema } from '../models/IntervalSchema';
import { WCategoryModel } from '../models/catalog/category/WCategorySchema';
import { WOptionModel as WOptionModelActual } from '../models/catalog/options/WOptionSchema';
import { WOptionTypeModel as WOptionTypeModelActual } from '../models/catalog/options/WOptionTypeSchema';
import { WProductModel as WProductModelActual } from '../models/catalog/products/WProductSchema';
import { WProductInstanceModel as WProductInstanceModelActual } from '../models/catalog/products/WProductInstanceSchema';
import { PrinterGroupModel } from '../models/catalog/WPrinterGroupSchema';
import mongoose, { Schema } from "mongoose";
import { exit } from 'process';
import { WOrderInstanceModel } from '../models/orders/WOrderInstance';
import { parseISO } from 'date-fns';
import { CatalogProviderInstance } from './catalog_provider';

const SetVersion = async (new_version: SEMVER) => {
  return await DBVersionModel.findOneAndUpdate({}, new_version, { new: true, upsert: true });
}

interface IMigrationFunctionObject {
  [index: string]: [SEMVER, () => Promise<void>]
}
const UPGRADE_MIGRATION_FUNCTIONS: IMigrationFunctionObject = {
  "0.3.6": [{ major: 0, minor: 3, patch: 7 }, async () => {
  }],
  "0.3.7": [{ major: 0, minor: 3, patch: 8 }, async () => {
  }],
  "0.3.8": [{ major: 0, minor: 3, patch: 9 }, async () => {
  }],
  "0.3.9": [{ major: 0, minor: 3, patch: 10 }, async () => {
    {
      // add props to Category
      const category_update = await WCategoryModel.updateMany(
        {},
        {
          $set: {
            "display_flags.nesting": "TAB",
            'serviceDisable': []
          }
        });
      if (category_update.modifiedCount > 0) {
        logger.debug(`Updated ${category_update.modifiedCount} Categories with nesting and serviceDisable props.`);
      }
      else {
        logger.warn("No categories had nesting or serviceDisable added");
      }
    }
  }],
  "0.3.10": [{ major: 0, minor: 4, patch: 0 }, async () => {
  }],
  "0.4.0": [{ major: 0, minor: 4, patch: 90 }, async () => {
    {
      // IProduct remove item and set externalIDs = {}
      // remove ProductModifierSchema.service_disable and log warning
      // move to camelCase: displayFlags, serviceDisable
      const WProductModel = mongoose.model('wproductsCHema', new Schema({
        modifiers: [{ mtid: String, enable: String, service_disable: Schema.Types.Mixed, serviceDisable: [String] }],
        item: Schema.Types.Mixed,
        externalIDs: Schema.Types.Mixed,
        displayFlags: Schema.Types.Mixed,
        display_flags: Schema.Types.Mixed,
        serviceDisable: [String],
        service_disable: [Number]
      }));
      const elts = await WProductModel.find();
      await Promise.all(elts.map(async (prod) => {
        prod.displayFlags = prod.display_flags;
        prod.display_flags = undefined;
        prod.externalIDs = {};
        prod.item = undefined;
        if (prod.service_disable.length > 0) {
          logger.warn(`About to remove product set service disable of ${JSON.stringify(prod.service_disable)} for ProductID: ${prod.id}`);
        }
        // @ts-ignore
        prod.service_disable = undefined;
        prod.serviceDisable = [];
        prod.modifiers = prod.modifiers.map(mod => {
          if (mod.service_disable.length > 0) {
            logger.warn(`About to remove modifier set service disable of ${JSON.stringify(mod.service_disable)} for ProductID: ${prod.id}`);
          }
          return { mtid: mod.mtid, enable: mod.enable, serviceDisable: [] };
        });
        return await prod.save()
          .then(doc => {
            logger.info(`Updated ProductModel with new schema: ${JSON.stringify(doc.toJSON())}`);
            return doc;
          })
          .catch(err => {
            logger.error(`Failed to update ProductModel ${prod.id} got error: ${JSON.stringify(err)}`);
            return Promise.reject(err);
          })
      }));
    }
    {
      // IProductInstance externalIDs set to {}, move description, displayName, shortcode, delete item, convert modifiers list to new modifiers list
      // remove ProductModifierSchema.service_disable and log warning
      const WProductInstanceModel = mongoose.model('WProductINStanceSchema', new Schema({
        modifiers: Schema.Types.Mixed,
        item: Schema.Types.Mixed,
        displayName: String,
        description: String,
        shortcode: String,
        externalIDs: Schema.Types.Mixed,
        is_base: Boolean,
        isBase: Boolean,
        displayFlags: Schema.Types.Mixed,
        display_flags: Schema.Types.Mixed,
        product_id: String,
        productId: String
      }));
      const elts = await WProductInstanceModel.find();
      await Promise.all(elts.map(async (pi) => {
        pi.shortcode = pi.item.shortcode;
        pi.description = pi.item.description;
        pi.displayName = pi.item.display_name;
        pi.externalIDs = {};
        pi.item = undefined;
        pi.displayFlags = pi.display_flags;
        pi.display_flags = undefined;
        pi.isBase = pi.is_base;
        pi.is_base = undefined;
        pi.productId = pi.product_id;
        pi.product_id = undefined;
        pi.modifiers = pi.modifiers.map((mod: {
          modifier_type_id: string;
          options: {
            option_id: string;
            placement: keyof typeof OptionPlacement;
            qualifier: keyof typeof OptionQualifier;
          }[];
        }) => ({
          modifierTypeId: mod.modifier_type_id, options: mod.options.map(
            x => ({ optionId: x.option_id, placement: OptionPlacement[x.placement], qualifier: OptionQualifier[x.qualifier] }))
        }));
        return await pi.save()
          .then(doc => {
            logger.info(`Updated ProductInstance with new schema: ${JSON.stringify(doc.toJSON())}`);
            return doc;
          })
          .catch(err => {
            logger.error(`Failed to update ProductInstance ${pi.id} got error: ${JSON.stringify(err)}`);
            return Promise.reject(err);
          })
      }));
    }
    {
      // IOption moves all item fields to base (displayName, description, shortcode, price, disabled), set externalIDs = {}
      // camelCase: displayName, enable, displayFlags, modifierTypeId
      const WOptionModel = mongoose.model('woPtioNschema', new Schema({
        item: Schema.Types.Mixed,
        displayName: String,
        description: String,
        shortcode: String,
        option_type_id: String,
        modifierTypeId: String,
        disabled: IntervalSchema,
        price: WMoney,
        externalIDs: Schema.Types.Mixed,
        displayFlags: Schema.Types.Mixed,
        display_flags: Schema.Types.Mixed,
        enable_function: Schema.Types.Mixed,
        enable: Schema.Types.Mixed
      }));
      const elts = await WOptionModel.find();
      await Promise.all(elts.map(async (opt) => {
        opt.shortcode = opt.item.shortcode;
        opt.description = opt.item.description;
        opt.displayName = opt.item.display_name;
        opt.price = opt.item.price;
        opt.disabled = opt.item.disabled ? opt.item.disabled : null;
        opt.externalIDs = {};
        opt.item = undefined;
        opt.displayFlags = opt.display_flags;
        opt.display_flags = undefined;
        opt.modifierTypeId = opt.option_type_id;
        opt.option_type_id = undefined;
        opt.enable = opt.enable_function ?? null;
        opt.enable_function = undefined;
        return await opt.save()
          .then(doc => {
            logger.info(`Updated ModifierOption with new schema: ${JSON.stringify(doc.toJSON())}`);
            return doc;
          })
          .catch(err => {
            logger.error(`Failed to update ModifierOption ${opt.id} got error: ${JSON.stringify(err)}`);
            return Promise.reject(err);
          });
      }));
    }
    {
      // IOptionType externalIDs = {}
      // camelCase: displayName, displayFlags
      const WOptionTypeModel = mongoose.model('WOpTIOntypeSchema', new Schema({
        display_name: String,
        displayName: String,
        externalIDs: Schema.Types.Mixed,
        displayFlags: Schema.Types.Mixed,
        display_flags: Schema.Types.Mixed,
      }));
      const elts = await WOptionTypeModel.find();
      await Promise.all(elts.map(async (opt) => {
        opt.displayName = opt.display_name;
        opt.display_name = undefined;
        opt.externalIDs = {};
        opt.displayFlags = opt.display_flags;
        opt.display_flags = undefined;
        return await opt.save()
          .then(doc => {
            logger.info(`Updated ModifierOptionType with new schema: ${JSON.stringify(doc.toJSON())}`);
            return doc;
          })
          .catch(err => {
            logger.error(`Failed to update ModifierOptionType ${opt.id} got error: ${JSON.stringify(err)}`);
            return Promise.reject(err);
          });
      }));
    }
  }],
  "0.4.90": [{ major: 0, minor: 4, patch: 91 }, async () => {
  }],
  "0.4.91": [{ major: 0, minor: 4, patch: 92 }, async () => {
  }],
  "0.4.92": [{ major: 0, minor: 4, patch: 93 }, async () => {
  }],
  "0.4.93": [{ major: 0, minor: 4, patch: 94 }, async () => {
  }],
  "0.4.94": [{ major: 0, minor: 4, patch: 95 }, async () => {

    const SettingsModel = mongoose.model('SeTTingsSchema', new Schema({
      pipeline_info: Schema.Types.Mixed,
      operating_hours: Schema.Types.Mixed,
      time_step: Schema.Types.Mixed,
      time_step2: Schema.Types.Mixed,
    }));
    const s_update = await SettingsModel.updateMany(
      {},
      {
        $unset: {
          "pipeline_info": "",
          "operating_hours": "",
          "time_step": "",
          "time_step2": "",
        }
      });
    if (s_update.modifiedCount > 0) {
      logger.debug(`Updated ${s_update.modifiedCount} SettingsModel documents to remove old settings fields.`);
    }
    else {
      logger.error("Didn't update SettingsModel");
    }
  }],
  "0.4.95": [{ major: 0, minor: 4, patch: 96 }, async () => {
  }],
  "0.4.96": [{ major: 0, minor: 4, patch: 97 }, async () => {
  }],
  "0.4.97": [{ major: 0, minor: 4, patch: 98 }, async () => {
  }],
  "0.4.98": [{ major: 0, minor: 4, patch: 99 }, async () => {
  }],
  "0.4.99": [{ major: 0, minor: 4, patch: 100 }, async () => {
  }],
  "0.4.100": [{ major: 0, minor: 4, patch: 101 }, async () => {
    {
      // add props to Category
      const category_update = await WCategoryModel.updateMany(
        {},
        {
          $set: {
            'serviceDisable': []
          }
        });
      if (category_update.modifiedCount > 0) {
        logger.debug(`Updated ${category_update.modifiedCount} Categories with empty serviceDisable props.`);
      }
      else {
        logger.warn("No categories had serviceDisable blanked added");
      }
    }
  }],
  "0.4.101": [{ major: 0, minor: 4, patch: 102 }, async () => {
  }],
  "0.4.102": [{ major: 0, minor: 4, patch: 103 }, async () => {
  }],
  "0.4.103": [{ major: 0, minor: 4, patch: 104 }, async () => {
  }],
  "0.4.104": [{ major: 0, minor: 4, patch: 105 }, async () => {
  }],
  "0.4.105": [{ major: 0, minor: 4, patch: 106 }, async () => {
  }],
  "0.4.106": [{ major: 0, minor: 5, patch: 0 }, async () => {
  }],
  "0.5.0": [{ major: 0, minor: 5, patch: 1 }, async () => {
    // Note: using the actual model only works in the moment this is written... probably can't do this safely
    await Promise.all([WOptionModelActual, WOptionTypeModelActual, WProductInstanceModelActual, WProductModelActual].map(async (model) => {
      const updateQuery = await model.updateMany(
        {},
        {
          externalIDs: []
        });
      if (updateQuery.modifiedCount > 0) {
        logger.debug(`Updated ${updateQuery.modifiedCount} ${model.modelName} documents with empty externalIDs list.`);
      }
      else {
        logger.error("Didn't update WOptionModel");
      }
    }));
  }],
  "0.5.1": [{ major: 0, minor: 5, patch: 2 }, async () => {
  }],
  "0.5.2": [{ major: 0, minor: 5, patch: 3 }, async () => {
  }],
  "0.5.3": [{ major: 0, minor: 5, patch: 4 }, async () => {
  }],
  "0.5.4": [{ major: 0, minor: 5, patch: 5 }, async () => {
  }],
  "0.5.5": [{ major: 0, minor: 5, patch: 6 }, async () => {
  }],
  "0.5.6": [{ major: 0, minor: 5, patch: 7 }, async () => {
  }],
  "0.5.7": [{ major: 0, minor: 5, patch: 8 }, async () => {
  }],
  "0.5.8": [{ major: 0, minor: 5, patch: 9 }, async () => {
    {
      // re-do nesting CategoryDisplay enum TAB -> FLAT
      const category_update = await WCategoryModel.updateMany(
        { 'display_flags.nesting': 'TAB' },
        {
          $set: {
            "display_flags.nesting": "FLAT"
          }
        });
      if (category_update.modifiedCount > 0) {
        logger.debug(`Updated ${category_update.modifiedCount} Categories from 'TAB' to 'FLAT' nesting field`);
      }
      else {
        logger.warn("No categories had nesting modified from 'TAB'");
      }
    }
    {
      // re-do nesting CategoryDisplay enum TAB_IMMEDIATE -> TAB
      const category_update = await WCategoryModel.updateMany(
        { 'display_flags.nesting': 'TAB_IMMEDIATE' },
        {
          $set: {
            "display_flags.nesting": "TAB"
          }
        });
      if (category_update.modifiedCount > 0) {
        logger.debug(`Updated ${category_update.modifiedCount} Categories from 'TAB_IMMEDIATE' to 'TAB' nesting field`);
      }
      else {
        logger.warn("No categories had nesting modified from 'TAB_IMMEDIATE'");
      }
    }
  }],
  "0.5.9": [{ major: 0, minor: 5, patch: 10 }, async () => {
    {
      // set baseProductId on all WProductSchema
      const WProductInstanceModel = mongoose.model('wpROductinstanceSchema', new Schema({ displayName: String, isBase: Schema.Types.Boolean, productId: String }, { id: true }));
      const WProductModel = mongoose.model('wpROductSchema', new Schema({ baseProductId: String }, { id: true }));
      const baseInstances = await WProductInstanceModel.find({ 'isBase': true }).exec();
      await Promise.all(baseInstances.map(async (basePi) => {
        try {
          const updatedProduct = await WProductModel.findByIdAndUpdate(basePi.productId!, { baseProductId: basePi.id }, { new: true }).exec();
          logger.info(`Updated product Id: ${updatedProduct!.id} with baseProductId of ${updatedProduct!.baseProductId}`);
          return updatedProduct;
        } catch (err) {
          const errMsg = `Failed updating Base ProductInstance ${basePi.displayName} (${basePi.id}), suggest deleting.`
          logger.error(errMsg);
          return null;
        }
      }));

      // find any WProductSchema without a baseProductId and delete
      const orphanedProducts = await WProductModel.find({ baseProductId: undefined }).exec();
      if (orphanedProducts.length > 0) {
        logger.warn(`Found products without baseProductId set, will delete: ${orphanedProducts.map(x => x.id).join(", ")}`);
        await WProductModel.deleteMany({ baseProductId: undefined }).exec();
        await Promise.all(orphanedProducts.map(async (product) => {
          const deleteProductInstanceResult = await WProductInstanceModel.deleteMany({ productId: product.id });
          logger.warn(`Deleted ${deleteProductInstanceResult.deletedCount} product instances for newly delete parent product id ${product.id}`);
          return deleteProductInstanceResult;
        }))
      }

      // remove isBase from all product instances
      const removeIsBaseUpdateResponse = await WProductInstanceModel.updateMany({}, { $unset: { isBase: "" } }).exec();
      logger.info(`Removed isBase from ${removeIsBaseUpdateResponse.modifiedCount} ProductInstances`);
    }
  }],
  "0.5.10": [{ major: 0, minor: 5, patch: 11 }, async () => {
  }],
  "0.5.11": [{ major: 0, minor: 5, patch: 12 }, async () => {
    {
      // mass set allowHeavy, allowLite, allowOTS to false for all IOption
      const WOptionModel = mongoose.model('woPTioNscHema', new Schema({
        metadata: {
          flavor_factor: Number,
          bake_factor: Number,
          can_split: Boolean,
          allowHeavy: Boolean,
          allowLite: Boolean,
          allowOTS: Boolean,
        },
      }));
      const updateResponse = await WOptionModel.updateMany({}, {
        $set: { 'metadata.allowHeavy': false, 'metadata.allowLite': false, 'metadata.allowOTS': false }
      }).exec();
      if (updateResponse.modifiedCount > 0) {
        logger.debug(`Updated ${updateResponse.modifiedCount} IOption with disabled allowallowHeavyExtra, allowLite, and allowOTS.`);
      }
      else {
        logger.warn("No options had allowHeavy allow  Extra, allowLite, and allowOTS disabled");
      }
    }
  }],
  "0.5.12": [{ major: 0, minor: 5, patch: 13 }, async () => {
    {
      // make a printer group for every category
      const found_key_value_store = await KeyValueModel.findOne().exec();
      if (!found_key_value_store) {
        exit(-1);
      }
      const categories = await WCategoryModel.find().exec();
      const printerGroups = await PrinterGroupModel.insertMany(categories.map(c=>({
        name: c.name,
        externalIDs: [],
        singleItemPerTicket: false
      })));
      const catIdToPGMapping = ReduceArrayToMapByKey(categories.map((c, i) => ({cId: c.id, pg: printerGroups[i]})), 'cId');
      const products = await WProductModelActual.find().exec();
      await Promise.all(products
        .filter(p=>p.category_ids.length > 0)
        .map(async(p) => {
          const pg = catIdToPGMapping[p.category_ids[0]].pg;
          return await WProductModelActual
            .findByIdAndUpdate(p.id, { printerGroup: pg.id }, { new: true }).exec()
            .then(doc => {
              logger.info(`Assigned printer group ${pg.name} to ProductId: ${p.id}`);
            })
            .catch((err: any) => {
              logger.error(`Failed updating product ID: ${p.id} with printer group. Got error: ${JSON.stringify(err)}`);
            });
      }));
    }
  }],
  "0.5.13": [{ major: 0, minor: 5, patch: 14 }, async () => {
  }],
  "0.5.14": [{ major: 0, minor: 5, patch: 15 }, async () => {
  }],
  "0.5.15": [{ major: 0, minor: 5, patch: 16 }, async () => {
  }],
  "0.5.16": [{ major: 0, minor: 5, patch: 17 }, async () => {
  }],
  "0.5.17": [{ major: 0, minor: 5, patch: 18 }, async () => {
  }],
  "0.5.18": [{ major: 0, minor: 5, patch: 19 }, async () => {
  }],
  "0.5.19": [{ major: 0, minor: 5, patch: 20 }, async () => {
    const allOrders = await WOrderInstanceModel.find();
    await Promise.all(allOrders.map(async (o) => {
      const newTime = WDateUtils.formatISODate(parseISO(o.fulfillment.selectedDate));
      logger.info(`Converting ${o.fulfillment.selectedDate} to ${newTime}`);
      return await WOrderInstanceModel.findByIdAndUpdate(o.id, { 'fulfillment.selectedDate': WDateUtils.formatISODate(parseISO(o.fulfillment.selectedDate)) });
    }))
  }],
  "0.5.20": [{ major: 0, minor: 5, patch: 21 }, async () => {
  }],
  "0.5.21": [{ major: 0, minor: 5, patch: 22 }, async () => {
  }],
  "0.5.22": [{ major: 0, minor: 5, patch: 23 }, async () => {
  }],
  "0.5.23": [{ major: 0, minor: 5, patch: 24 }, async () => {
  }],
  "0.5.24": [{ major: 0, minor: 5, patch: 25 }, async () => {
  }],
  "0.5.25": [{ major: 0, minor: 5, patch: 26 }, async () => {
  }],
  "0.5.26": [{ major: 0, minor: 5, patch: 27 }, async () => {
  }],
  "0.5.27": [{ major: 0, minor: 5, patch: 28 }, async () => {
  }],
  "0.5.28": [{ major: 0, minor: 5, patch: 29 }, async () => {
  }],
  "0.5.29": [{ major: 0, minor: 5, patch: 30 }, async () => {
  }],
  "0.5.30": [{ major: 0, minor: 5, patch: 31 }, async () => {
  }],
  "0.5.31": [{ major: 0, minor: 5, patch: 32 }, async () => {
  }],
  "0.5.32": [{ major: 0, minor: 5, patch: 33 }, async () => {
  }],
  "0.5.33": [{ major: 0, minor: 5, patch: 34 }, async () => {
  }],
  "0.5.34": [{ major: 0, minor: 5, patch: 35 }, async () => {
  }],
  "0.5.35": [{ major: 0, minor: 5, patch: 36 }, async () => {
  }],
  "0.5.36": [{ major: 0, minor: 5, patch: 39 }, async () => {
    CatalogProviderInstance.RequireSquareRebuild = true;
  }],
  "0.5.37": [{ major: 0, minor: 5, patch: 38 }, async () => {
  }],
  "0.5.38": [{ major: 0, minor: 5, patch: 39 }, async () => {
    CatalogProviderInstance.RequireSquareRebuild = true;
  }],
  "0.5.39": [{ major: 0, minor: 5, patch: 40 }, async () => {
  }],
}

export class DatabaseManager implements WProvider {
  constructor() {
  }

  Bootstrap = async () => {
    const [VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH] = PACKAGE_JSON.version.split(".", 3).map(x => parseInt(x));
    const VERSION_PACKAGE = { major: VERSION_MAJOR, minor: VERSION_MINOR, patch: VERSION_PATCH };

    // load version from the DB
    logger.info("Running database upgrade bootstrap.");

    var current_db_version = "0.0.0";

    const db_version = await DBVersionModel.find({});
    if (db_version.length > 1) {
      logger.error(`Found more than one DB version entry: ${JSON.stringify(db_version)}, deleting all.`);
      await DBVersionModel.deleteMany({});
    }
    else if (db_version.length === 1) {
      current_db_version = `${db_version[0].major}.${db_version[0].minor}.${db_version[0].patch}`;
    }

    // run update loop
    while (PACKAGE_JSON.version !== current_db_version) {
      if (Object.hasOwn(UPGRADE_MIGRATION_FUNCTIONS, current_db_version)) {
        const [next_ver, migration_function] = UPGRADE_MIGRATION_FUNCTIONS[current_db_version];
        const next_ver_string = `${next_ver.major}.${next_ver.minor}.${next_ver.patch}`;
        logger.info(`Running migration function from ${current_db_version} to ${next_ver_string}`);
        await migration_function();
        await SetVersion(next_ver);
        current_db_version = next_ver_string;
      }
      else {
        logger.warn(`No explicit migration from ${current_db_version} to ${PACKAGE_JSON.version}, setting to new version.`);
        await SetVersion(VERSION_PACKAGE);
        current_db_version = PACKAGE_JSON.version;
      }
    }
    logger.info("Database upgrade checks completed.");
  };


}

export const DatabaseManagerInstance = new DatabaseManager();
