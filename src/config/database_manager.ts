import logger from '../logging';
import { WProvider } from '../types/WProvider';
import PACKAGE_JSON from '../../package.json';
import { SEMVER, WDateUtils } from '@wcp/wcpshared';
import DBVersionModel from '../models/DBVersionSchema';
import { WOptionModel as WOptionModelActual } from '../models/catalog/options/WOptionSchema';
import { WOptionTypeModel as WOptionTypeModelActual } from '../models/catalog/options/WOptionTypeSchema';
import mongoose, { Schema } from "mongoose";
import { WOrderInstanceModel } from '../models/orders/WOrderInstance';
import { WMoney } from '../models/WMoney';
import { parseISO } from 'date-fns';
import { CatalogProviderInstance } from './catalog_provider';
import { WARIO_SQUARE_ID_METADATA_KEY } from './SquareWarioBridge';
import { SquareProviderInstance } from './square';

const SetVersion = async (new_version: SEMVER) => {
  return await DBVersionModel.findOneAndUpdate({}, new_version, { new: true, upsert: true });
}

interface IMigrationFunctionObject {
  [index: string]: [SEMVER, () => Promise<void>]
}
const UPGRADE_MIGRATION_FUNCTIONS: IMigrationFunctionObject = {
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
  "0.5.38": [{ major: 0, minor: 5, patch: 39 }, async () => {
    CatalogProviderInstance.RequireSquareRebuild = true;
  }],
  "0.5.39": [{ major: 0, minor: 5, patch: 40 }, async () => {
  }],
  "0.5.40": [{ major: 0, minor: 5, patch: 41 }, async () => {
  }],
  "0.5.41": [{ major: 0, minor: 5, patch: 42 }, async () => {
  }],
  "0.5.42": [{ major: 0, minor: 5, patch: 43 }, async () => {
    const allOptionsUpdate = await WOptionModelActual.updateMany({}, { $pull: { 'externalIDs': { key: { $regex: `^${WARIO_SQUARE_ID_METADATA_KEY}.*` } } } })
    logger.info(`Updated options: ${JSON.stringify(allOptionsUpdate)}`);
    const allModifierTypeUpdate = await WOptionTypeModelActual.updateMany({}, { $pull: { 'externalIDs': { key: { $regex: `^${WARIO_SQUARE_ID_METADATA_KEY}.*` } } } })
    logger.info(`Updated modifier types: ${JSON.stringify(allModifierTypeUpdate)}`);
    SquareProviderInstance.ObliterateModifiersOnLoad = true;
    CatalogProviderInstance.RequireSquareRebuild = true;
  }],
  "0.5.43": [{ major: 0, minor: 5, patch: 44 }, async () => {
    {
      const WFulfillmentSchema = mongoose.model('fulFILLmentSCHEMA', new Schema({
        exposeFulfillment: {
          type: Boolean,
          required: true
        }
      }, { id: true }));
      const updatedFulfillments = await WFulfillmentSchema.updateMany({}, { exposeFulfillment: true }, {});
      logger.info(`Updated fulfillments, setting exposeFulfillment to true, got result: ${JSON.stringify(updatedFulfillments)}`);
    }
    {
      // mass set is3p to false on OptionType
      const WOptionTypeModel = mongoose.model('woPTioNtypescHema', new Schema({
        displayFlags: {
          is3p: Boolean
        },
      }));
      const updateResponse = await WOptionTypeModel.updateMany({}, {
        $set: { 'displayFlags.is3p': false }
      }).exec();
      if (updateResponse.modifiedCount > 0) {
        logger.debug(`Updated ${updateResponse.modifiedCount} IOptionType with disabled is3p.`);
      }
      else {
        logger.warn("No option types had is3p disabled");
      }
    }
    {
      // mass set is3p to false on IProduct
      const WProductModel = mongoose.model('wproDUctsCHema', new Schema({
        displayFlags: {
          is3p: Boolean
        },
      }));
      const updateResponse = await WProductModel.updateMany({}, {
        $set: { 'displayFlags.is3p': false }
      }).exec();
      if (updateResponse.modifiedCount > 0) {
        logger.debug(`Updated ${updateResponse.modifiedCount} IProduct with disabled is3p.`);
      }
      else {
        logger.warn("No IProduct had is3p disabled");
      }
    }
  }],
  "0.5.57": [{ major: 0, minor: 5, patch: 58 }, async () => {
  }],
  "0.5.58": [{ major: 0, minor: 5, patch: 59 }, async () => {
    {
      // set isExpo to false for all printer groups
      const WPrinterGroupSchema = mongoose.model('WPRINTERGroupSchema', new Schema({
        isExpo: Boolean,
      }));
      const updateResponse = await WPrinterGroupSchema.updateMany({}, {
        $set: { 'isExpo': false }
      }).exec();
      if (updateResponse.modifiedCount > 0) {
        logger.debug(`Updated ${updateResponse.modifiedCount} WPrinterGroupSchema with disabled isExpo.`);
      }
      else {
        logger.warn("No WPrinterGroupSchema had isExpo disabled");
      }
    }
  }],
  "0.5.59": [{ major: 0, minor: 5, patch: 60 }, async () => {
    // add balance to OrderLineDiscountCodeAmount.discount
    // move OrderPaymentAllocated.payment.processorId to OrderPaymentAllocated.processorId
    const discountSchema = new Schema({
      discount: {
        type: {
          amount: {
            type: WMoney,
            required: true
          },
          balance: {
            type: WMoney,
            required: true
          },
        },
        required: true
      }
    });
    const paymentSchema = new Schema({
      processorId: String,
      payment: {
        type: {
          processorId: String
        },
        required: true
      }
    })
    const WOrderInstanceSchema = mongoose.model('wOrderinstancE', new Schema({
      discounts: {
        type: [discountSchema],
        required: true
      },
      payments: {
        type: [paymentSchema],
        required: true
      },
    }, { id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }));
    const allOrders = await WOrderInstanceSchema.find();
    const updatedOrders = await Promise.all(allOrders.map(async (o) => {
      o.discounts.forEach(d => {
        d.discount.balance = d.discount.amount;
      });
      o.payments.forEach(p => {
        p.processorId = p.payment.processorId;
      })
      return await o.save()
        .then(doc => {
          logger.info(`Updated WOrderInstance (${doc.id}) with new schema`);
          return doc;
        })
        .catch(err => {
          logger.error(`Failed to update WOrderInstance got error: ${JSON.stringify(err)}`);
          return Promise.reject(err);
        })
    }));
  }],
  "0.5.60": [{ major: 0, minor: 5, patch: 61 }, async () => {
    // set displayFlags.hideFromPos to false for all WProductInstance
    const WProductInstanceSchema = mongoose.model('WPrODUctInstanceSchema', new Schema({
      displayFlags: {
        hideFromPos: Boolean,
      }
    }));
    const updateResponse = await WProductInstanceSchema.updateMany({}, {
      $set: { 'displayFlags.hideFromPos': false }
    }).exec();
    if (updateResponse.modifiedCount > 0) {
      logger.debug(`Updated ${updateResponse.modifiedCount} WProductInstanceSchema with disabled hideFromPos.`);
    }
    else {
      logger.warn("No WProductInstanceSchema had hideFromPos set");
    }
  }],
  "0.5.61": [{ major: 0, minor: 5, patch: 62 }, async () => {
  }],
  "0.5.62": [{ major: 0, minor: 5, patch: 63 }, async () => {
    {
      // add null availability to all products
      // add null timing to all products
      const WProductModel = mongoose.model('wproduCtsChema', new Schema({
        availability: Schema.Types.Mixed,
        timing: Schema.Types.Mixed,
      }));

      const updateResponse = await WProductModel.updateMany({}, {
        $set: { 'availability': null, 'timing': null }
      }).exec();
      if (updateResponse.modifiedCount > 0) {
        logger.debug(`Updated ${updateResponse.modifiedCount} IProduct with null availability, null timimng.`);
      }
      else {
        logger.warn("No IProduct had availability and timing set to null");
      }
    }

    {
      // add null availability to all modifier options
      const WOptionModel = mongoose.model('woPtioNschEma', new Schema({
        availability: Schema.Types.Mixed
      }));
      const updateResponse = await WOptionModel.updateMany({}, {
        $set: { 'availability': null }
      }).exec();
      if (updateResponse.modifiedCount > 0) {
        logger.debug(`Updated ${updateResponse.modifiedCount} IOption with null availability.`);
      }
      else {
        logger.warn("No options had availability set to null");
      }
    }

    {
      // add null availability to all modifier options
      const WOptionModel = mongoose.model('woPtioNschema', new Schema({
        availability: Schema.Types.Mixed
      }));
      const updateResponse = await WOptionModel.updateMany({}, {
        $set: { 'availability': null }
      }).exec();
      if (updateResponse.modifiedCount > 0) {
        logger.debug(`Updated ${updateResponse.modifiedCount} IOption with null availability.`);
      }
      else {
        logger.warn("No options had availability set to null");
      }
    }

    {
      // set allowTipping to true
      const WFulfillmentSchema = mongoose.model('fulFIlLmEntSCHEMA', new Schema({
        allowTipping: {
          type: Boolean,
          required: true
        }
      }, { id: true }));
      const updatedFulfillments = await WFulfillmentSchema.updateMany({}, { allowTipping: true }, { new: true });
      logger.info(`Updated fulfillments, setting allowTipping to true, got result: ${JSON.stringify(updatedFulfillments)}`);
    }
  }],
  "0.5.68": [{ major: 0, minor: 5, patch: 69 }, async () => {
    // mass set posName to empty string on WProductInstance
    const WProductInstanceSchema = mongoose.model('WPrODUcTInstanceSchema', new Schema({
      displayFlags: {
        posName: String,
      }
    }));
    const updateResponse = await WProductInstanceSchema.updateMany({}, {
      $set: { 'displayFlags.posName': "" }
    }).exec();
    if (updateResponse.modifiedCount > 0) {
      logger.debug(`Updated ${updateResponse.modifiedCount} WProductInstanceSchema with empty posName.`);
    }
    else {
      logger.warn("No WProductInstanceSchema had posName set to empty string");
    }
  }],
  "0.5.69": [{ major: 0, minor: 5, patch: 84 }, async () => {
  }],
  "0.5.84": [{ major: 0, minor: 5, patch: 85 }, async () => {
  }],
  "0.5.85": [{ major: 0, minor: 5, patch: 86 }, async () => {
  }],
  "0.5.86": [{ major: 0, minor: 5, patch: 87 }, async () => {
  }],
  "0.5.87": [{ major: 0, minor: 5, patch: 88 }, async () => {
  }],
  "0.5.88": [{ major: 0, minor: 5, patch: 89 }, async () => {
  }],
  "0.5.89": [{ major: 0, minor: 6, patch: 0 }, async () => {
    {
      const WProductModel = mongoose.model('wproductsCHema', new Schema({
        availability: {
          type: [Schema.Types.Mixed],
          default: []
        },
      }));
      const elts = await WProductModel.find();
      await Promise.all(elts.map(async (prod) => {
        if (prod.availability === null) {
          // If availability is null, set it to an empty array
          prod.availability = [];
        } else if (!Array.isArray(prod.availability)) {
          // If availability is not an array, wrap it in an array
          // @ts-ignore
          prod.availability = [prod.availability];
        }
        return await prod.save()
          .then(doc => {
            logger.info(`Updated ProductModel ${doc.id} with availability: ${JSON.stringify(doc.availability)}`);
            return doc;
          })
          .catch(err => {
            logger.error(`Failed to update ProductModel ${prod.id} got error: ${JSON.stringify(err)}`);
            return Promise.reject(err);
          });
      }));
    }
    {
      // convert availability on modifier options to array
      const WOptionModel = mongoose.model('woPtIoNschema', new Schema({
        availability: {
          type: [Schema.Types.Mixed],
          default: []
        },
      }));
      const elts = await WOptionModel.find();
      await Promise.all(elts.map(async (opt) => {
        if (opt.availability === null) {
          // If availability is null, set it to an empty array
          opt.availability = [];
        } else if (!Array.isArray(opt.availability)) {
          // If availability is not an array, wrap it in an array
          // @ts-ignore
          opt.availability = [opt.availability];
        }
        return await opt.save()
          .then(doc => {
            logger.info(`Updated WOptionModel ${doc.id} with availability: ${JSON.stringify(doc.availability)}`);
            return doc;
          })
          .catch(err => {
            logger.error(`Failed to update WOptionModel ${opt.id} got error: ${JSON.stringify(err)}`);
            return Promise.reject(err);
          });
      }));
    }
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
