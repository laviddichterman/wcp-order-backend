import { WProvider } from '../types/WProvider';
import { FulfillmentConfig, ReduceArrayToMapByKey, IWSettings, PostBlockedOffToFulfillmentsRequest, SetLeadTimesRequest, WDateUtils } from '@wcp/wcpshared';
import { HydratedDocument } from 'mongoose';
import logger from '../logging';
import { KeyValueModel, IKeyValueStore } from '../models/settings/KeyValueSchema';
import { SettingsModel } from '../models/settings/SettingsSchema';
import { FulfillmentModel } from '../models/settings/FulfillmentSchema';
import { Promise } from 'bluebird';


export class DataProvider implements WProvider {
  #settings: IWSettings;
  #fulfillments: Record<string, FulfillmentConfig>;
  #keyvalueconfig: { [key: string]: string };

  constructor() {
    this.#fulfillments = {};
    this.#settings = { additional_pizza_lead_time: 5, config: {} };
    this.#keyvalueconfig = {};
  }

  syncFulfillments = async() => {
    logger.debug(`Syncing Fulfillments.`);
    try {
      this.#fulfillments = ReduceArrayToMapByKey((await FulfillmentModel.find().exec()).map(x => x.toObject()), 'id');
    } catch (err) {
      logger.error(`Failed fetching option types with error: ${JSON.stringify(err)}`);
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
  get KeyValueConfig() {
    return this.#keyvalueconfig;
  }

  set Settings(da) {
    this.#settings = da;
    SettingsModel.findOne(function (_err: Error, db_settings: HydratedDocument<IWSettings>) {
      Object.assign(db_settings, da);
      db_settings.save()
        .then(() => { logger.debug("Saved settings %o", db_settings) })
        .catch(err => { logger.error("Error saving settings %o", err) });
    });
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

  set KeyValueConfig(da) {
    this.#keyvalueconfig = da;
    KeyValueModel.findOne(function (_err: Error, db_key_values: HydratedDocument<IKeyValueStore>) {
      const settings_list = [];
      for (var i in da) {
        settings_list.push({ key: i, value: da[i] });
      }
      db_key_values.settings = settings_list;
      db_key_values.save()
        .then(() => { logger.debug("Saved key/value config %o", db_key_values) })
        .catch(err => { logger.error("Error saving key/value config %o", err) });
    });
  }
};

export const DataProviderInstance = new DataProvider();