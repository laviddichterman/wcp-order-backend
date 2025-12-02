import { WProvider } from '../types/WProvider';
import { FulfillmentConfig, ReduceArrayToMapByKey, IWSettings, PostBlockedOffToFulfillmentsRequest, SetLeadTimesRequest, WDateUtils, SeatingResource } from '@wcp/wario-shared';
import logger from '../logging';
import { KeyValueModel } from '../models/settings/KeyValueSchema';
import { SettingsModel } from '../models/settings/SettingsSchema';
import { FulfillmentModel } from '../models/settings/FulfillmentSchema';
import { Promise } from 'bluebird';
import { SeatingResourceModel } from '../models/orders/WSeatingResource';

export class DataProvider implements WProvider {
  #settings: IWSettings;
  #fulfillments: Record<string, FulfillmentConfig>;
  #keyvalueconfig: { [key: string]: string };
  #seatingResources: Record<string, SeatingResource>;

  constructor() {
    this.#fulfillments = {};
    this.#seatingResources = {};
    this.#settings = { additional_pizza_lead_time: 5, config: {} };
    this.#keyvalueconfig = {};
  }

  syncFulfillments = async () => {
    logger.debug(`Syncing Fulfillments.`);
    try {
      this.#fulfillments = ReduceArrayToMapByKey((await FulfillmentModel.find().exec()).map(x => x.toObject()), 'id');
    } catch (err) {
      logger.error(`Failed fetching fulfillments with error: ${JSON.stringify(err)}`);
    }
  }

  syncSeatingResources = async () => {
    logger.debug(`Syncing Seating Resources.`);
    try {
      this.#seatingResources = ReduceArrayToMapByKey((await SeatingResourceModel.find().exec()).map(x => x.toObject()), 'id');
    } catch (err) {
      logger.error(`Failed fetching seating resources with error: ${JSON.stringify(err)}`);
    }
  }

  Bootstrap = async () => {
    logger.info("DataProvider: Loading from and bootstrapping to database.");

    await this.syncFulfillments();

    // look for key value config area:
    const found_key_value_store = await KeyValueModel.findOne();
    if (!found_key_value_store) {
      this.#keyvalueconfig = {};
      let keyvalueconfig_document = new KeyValueModel({ settings: [] });
      await keyvalueconfig_document.save();
      logger.info("Added default (empty) key value config area");
    }
    else {
      logger.debug("Found KeyValueSchema in database: ", found_key_value_store);
      for (var i in found_key_value_store.settings) {
        if (Object.hasOwn(this.#keyvalueconfig, found_key_value_store.settings[i].key)) {
          logger.error(`Clobbering key: ${found_key_value_store.settings[i].key} containing ${this.#keyvalueconfig[found_key_value_store.settings[i].key]}`);
        }
        this.#keyvalueconfig[found_key_value_store.settings[i].key] = found_key_value_store.settings[i].value;
      }
    }

    // check for and populate settings, including operating hours
    const found_settings = await SettingsModel.findOne();
    logger.info("Found settings: %o", found_settings);
    this.#settings = found_settings!;


    logger.debug("Done Bootstrapping DataProvider");
  };

  get Settings() {
    return this.#settings;
  }

  get Fulfillments() {
    return this.#fulfillments;
  }

  get SeatingResources() {
    return this.#seatingResources;
  }

  get KeyValueConfig() {
    return this.#keyvalueconfig;
  }

  /**
   * Update settings in memory and persist to database.
   * Mongoose 7 removed callback support, so this is now an async method.
   */
  updateSettings = async (da: IWSettings) => {
    this.#settings = da;
    try {
      const db_settings = await SettingsModel.findOne();
      if (db_settings) {
        Object.assign(db_settings, da);
        await db_settings.save();
        logger.debug("Saved settings %o", db_settings);
      }
    } catch (err) {
      logger.error("Error saving settings %o", err);
      throw err;
    }
  }



  postBlockedOffToFulfillments = async (request: PostBlockedOffToFulfillmentsRequest) => {
    return await Promise.all(request.fulfillmentIds.map(async (fId) => {
      const newBlockedOff = WDateUtils.AddIntervalToDate(request.interval, request.date, this.#fulfillments[fId].blockedOff);
      return await FulfillmentModel.findByIdAndUpdate(fId, { 'blockedOff': newBlockedOff });
    }));
  }

  deleteBlockedOffFromFulfillments = async (request: PostBlockedOffToFulfillmentsRequest) => {
    return await Promise.all(request.fulfillmentIds.map(async (fId) => {
      const newBlockedOff = WDateUtils.SubtractIntervalFromDate(request.interval, request.date, this.#fulfillments[fId].blockedOff, this.#fulfillments[fId].timeStep);
      return await FulfillmentModel.findByIdAndUpdate(fId, { 'blockedOff': newBlockedOff });
    }));
  }

  setLeadTimes = async (request: SetLeadTimesRequest) => {
    return await Promise.all(Object.entries(request).map(async ([fId, leadTime]) => {
      return await FulfillmentModel.findByIdAndUpdate(fId, { 'leadTime': leadTime });
    }));
  }

  setFulfillment = async (fulfillment: Omit<FulfillmentConfig, 'id'>) => {
    const fm = new FulfillmentModel(fulfillment);
    const savePromise = fm.save()
      .then(x => {
        logger.debug(`Saved new fulfillment: ${JSON.stringify(x)}`);
        this.#fulfillments[x.id] = x;
        return x;
      })
      .catch(err => {
        logger.error(`Error saving new fulfillment: ${JSON.stringify(err)}`);
        return Promise.reject(err);
      });
    return savePromise;
  }

  updateFulfillment = async (id: string, fulfillment: Partial<Omit<FulfillmentConfig, 'id'>>) => {
    return FulfillmentModel.findByIdAndUpdate(id,
      fulfillment,
      { new: true })
      .then(doc => {
        logger.debug(`Updated fulfillment[${id}]: ${JSON.stringify(doc)}`);
        this.#fulfillments[id] = doc!;
        return doc;
      })
      .catch(err => {
        logger.error(`Error updating fulfillment: ${JSON.stringify(err)}`);
        return Promise.reject(err);
      });
  }

  /** this probably should get deleted. We want to disable seating resources and repurpose disabled ones otherwise this might become a data management nightmare */
  deleteFulfillment = async (id: string) => {
    return FulfillmentModel.findByIdAndDelete(id)
      .then(doc => {
        logger.debug(`Deleted fulfillment[${id}]: ${JSON.stringify(doc)}`);
        delete this.#fulfillments[id];
        return doc;
      })
      .catch(err => {
        logger.error(`Error deleting fulfillment: ${JSON.stringify(err)}`);
        return Promise.reject(err);
      });
  }


  setSeatingResource = async (seatingResource: Omit<SeatingResource, 'id'>) => {
    const sr = new SeatingResourceModel(seatingResource);
    const savePromise = sr.save()
      .then(x => {
        logger.debug(`Saved new seating resource: ${JSON.stringify(x)}`);
        this.#seatingResources[x.id] = x;
        return x;
      })
      .catch(err => {
        logger.error(`Error saving new seating resource: ${JSON.stringify(err)}`);
        return Promise.reject(err);
      });
    return savePromise;
  }

  updateSeatingResource = async (id: string, seatingResource: Partial<Omit<SeatingResource, 'id'>>) => {
    return SeatingResourceModel.findByIdAndUpdate(id,
      seatingResource,
      { new: true })
      .then(doc => {
        logger.debug(`Updated Seating Resource[${id}]: ${JSON.stringify(doc)}`);
        this.#seatingResources[id] = doc!;
        return doc;
      })
      .catch(err => {
        logger.error(`Error updating Seating Resource: ${JSON.stringify(err)}`);
        return Promise.reject(err);
      });
  }

  /** precondition: references to this seating resource have already been removed from the catalog! */
  deleteSeatingResource = async (id: string) => {
    return SeatingResourceModel.findByIdAndDelete(id)
      .then(doc => {
        logger.debug(`Deleted seating resource[${id}]: ${JSON.stringify(doc)}`);
        delete this.#seatingResources[id];
        return doc;
      })
      .catch(err => {
        logger.error(`Error deleting seating resource: ${JSON.stringify(err)}`);
        return Promise.reject(err);
      });
  }

  /**
   * Update key/value config in memory and persist to database.
   * Mongoose 7 removed callback support, so this is now an async method.
   */
  updateKeyValueConfig = async (da: { [key: string]: string }) => {
    this.#keyvalueconfig = da;
    try {
      const db_key_values = await KeyValueModel.findOne();
      if (db_key_values) {
        const settings_list: { key: string; value: string }[] = [];
        for (const i in da) {
          settings_list.push({ key: i, value: da[i] });
        }
        db_key_values.settings = settings_list;
        await db_key_values.save();
        logger.debug("Saved key/value config %o", db_key_values);
      }
    } catch (err) {
      logger.error("Error saving key/value config %o", err);
      throw err;
    }
  }
};

export const DataProviderInstance = new DataProvider();