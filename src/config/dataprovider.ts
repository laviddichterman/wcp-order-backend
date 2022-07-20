import { WProvider } from '../types/WProvider';
import { IWBlockedOff, IWSettings, JSFEBlockedOff, WDateUtils } from '@wcp/wcpshared';
import { HydratedDocument } from 'mongoose';
import logger from '../logging';
import DeliveryAreaModel from '../models/settings/DeliveryAreaSchema';
import KeyValueModel, { IKeyValueStore } from '../models/settings/KeyValueSchema';
import LeadTimeModel from '../models/settings/LeadTimeSchema';
import BlockedOffModel from '../models/settings/BlockedOffSchema';
import StringListModel from '../models/settings/StringListSchema';
import SettingsModel from '../models/settings/SettingsSchema';
import DEFAULT_LEAD_TIMES from "../../data/leadtimeschemas.default.json";
import DEFAULT_SETTINGS from "../../data/settingsschemas.default.json";
import DEFAULT_SERVICES from "../../data/servicesschemas.default.json";
import DEFAULT_DELIVERY_AREA from "../../data/deliveryareaschemas.default.json";


export class DataProvider implements WProvider {
  #services: string[];
  #settings : IWSettings;
  #blocked_off : JSFEBlockedOff;
  #leadtimes : number[];
  #delivery_area : GeoJSON.Polygon; 
  #keyvalueconfig : { [key:string]: string };
  constructor() {
    this.#services = null;
    this.#settings = null;
    this.#blocked_off = [];
    this.#leadtimes = [];
    this.#delivery_area = DEFAULT_DELIVERY_AREA as unknown as GeoJSON.Polygon;
    this.#keyvalueconfig = {};
  }
  Bootstrap = async () => {
    logger.info("DataProvider: Loading from and bootstrapping to database.");

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

    // look for delivery area:
    const found_delivery_area = await DeliveryAreaModel.findOne();
    if (!found_delivery_area) {
      this.#delivery_area = DEFAULT_DELIVERY_AREA as unknown as GeoJSON.Polygon;
      let delivery_area_document = new DeliveryAreaModel(DEFAULT_DELIVERY_AREA);
      await delivery_area_document.save();
      logger.info("Added default delivery area: %o", delivery_area_document);
    }
    else {
      logger.debug("Found delivery area in database: ", found_delivery_area);
      this.#delivery_area = found_delivery_area;
    }

    // look for services
    const found_services = await StringListModel.findOne();
    if (!found_services || !found_services.services.length) {
      this.#services = DEFAULT_SERVICES.services;
      let services_document = new StringListModel(DEFAULT_SERVICES);
      await services_document.save();
      logger.info("Added default services list: %o", services_document);
    }
    else {
      logger.debug("Found services in database: ", found_services.services);
      this.#services = found_services.services;
    }

    // check for and populate lead times
    this.#leadtimes = Array<number>(this.#services.length).fill(null);
    const found_leadtimes = await LeadTimeModel.find();
    if (!found_leadtimes || !found_leadtimes.length) {
      logger.info("Intializing LeadTimes with defaults.");
      for (var i in DEFAULT_LEAD_TIMES) {
        this.#leadtimes[DEFAULT_LEAD_TIMES[i].service] = DEFAULT_LEAD_TIMES[i].lead;
        let lt = new LeadTimeModel({ service: i, lead: DEFAULT_LEAD_TIMES[i].lead });
        lt.save()
          .then(x => { logger.debug("Saved lead time of %o", lt) })
          .catch(err => { logger.error("Error saving lead time %o", err); });
      }
    }
    else {
      for (var i in found_leadtimes) {
        this.#leadtimes[found_leadtimes[i].service] = found_leadtimes[i].lead;
      }
    }
    if (found_leadtimes.length != Object.keys(this.#services).length) {
      logger.error("we have a mismatch in service length and leadtimes stored in the DB");
    }

    //see if any leadtimes don't have a value yet and populate them
    // this is being extra safe, we shouldn't get here.
    for (var j in this.#leadtimes) {
      if (!this.#leadtimes[j]) {
        this.#leadtimes[j] = 35;
        let lt = new LeadTimeModel({ service: j, lead: 35 });
        logger.error("Missing leadtime value! %o", lt);
        lt.save()
          .then(x => { logger.debug("Saved leadtime: %o", lt) })
          .catch(err => { logger.error("Error saving lead time for missing value %o", err) });
      }
    }

    // check for and populate settings, including operating hours
    const found_settings = await SettingsModel.findOne();
    if (!found_settings) {
      logger.info("No settings found, populating from defaults: %o", DEFAULT_SETTINGS);
      this.#settings = DEFAULT_SETTINGS as unknown as IWSettings;
      let settings_document = new SettingsModel(DEFAULT_SETTINGS);
      settings_document.save()
        .then(x => { logger.debug("Saved settings: %o", settings_document) })
        .catch(err => { logger.error("Error saving settings %o", err) });
    }
    else {
      logger.info("Found settings: %o", found_settings);
      this.#settings = found_settings;
    }

    // populate blocked off array
    this.#blocked_off = Array(this.#services.length).fill([]);
    const found_blocked_off = await BlockedOffModel.findOne();
    if (!found_blocked_off) {
      logger.debug("No blocked off entries found. Creating blocked off array of length %o", this.#services.length);
      const blocked_off = new BlockedOffModel({ blocked_off: [] });
      blocked_off.save()
        .then(e => { logger.debug("Saved blocked off %o", blocked_off) })
        .catch(err => { logger.error("Error saving blocked off %o", err) });
    }
    else {
      logger.debug("Found blocked off: %o", found_blocked_off);
      for (var i in found_blocked_off.blocked_off) {
        const entry = found_blocked_off.blocked_off[i];
        logger.debug("Adding blocked off... Service: %o Date: %o Excluded: %o", entry.service, entry.exclusion_date, entry.excluded_intervals);
        for (var j in entry.excluded_intervals) {
          WDateUtils.AddIntervalToService(entry.service,
            entry.exclusion_date,
            [entry.excluded_intervals[j].start, entry.excluded_intervals[j].end],
            this.#blocked_off);
        }
      }
    }

    logger.debug("Done Bootstrapping DataProvider");
  };

  get BlockedOff() {
    return this.#blocked_off;
  }
  get Settings() {
    return this.#settings;
  }
  get LeadTimes() {
    return this.#leadtimes;
  }
  get Services() {
    return this.#services;
  }
  get DeliveryArea() {
    return this.#delivery_area;
  }
  get KeyValueConfig() {
    return this.#keyvalueconfig;
  }


  set BlockedOff(da) {
    this.#blocked_off = da;
    let new_blocked_off : IWBlockedOff['blocked_off'] = [];
    for (var i in da) {
      for (var j in da[i]) {
        const excluded_intervals = [];
        for (var k in da[i][j][1]) {
          excluded_intervals.push({ start: da[i][j][1][k][0], end: da[i][j][1][k][1] })
        }
        new_blocked_off.push({ service: parseInt(i), exclusion_date: da[i][j][0], excluded_intervals: excluded_intervals });
      }
    }
    logger.debug("Generated blocked off array: %o", new_blocked_off);
    BlockedOffModel.findOne(function (_err : Error, db_blocked : HydratedDocument<IWBlockedOff>) {
      Object.assign(db_blocked, { blocked_off: new_blocked_off });
      db_blocked.save()
        .then(() => { logger.debug("Saved blocked off %o", db_blocked) })
        .catch(err => { logger.error("Error saving blocked off %o", err) });
    });
  }
  set Settings(da) {
    this.#settings = da;
    SettingsModel.findOne(function (_err : Error, db_settings : HydratedDocument<IWSettings>) {
      Object.assign(db_settings, da);
      db_settings.save()
        .then(() => { logger.debug("Saved settings %o", db_settings) })
        .catch(err => { logger.error("Error saving settings %o", err) });
    });
  }

  set LeadTimes(da) {
    this.#leadtimes = da;
    LeadTimeModel.find(function (_err, leadtimes) {
      for (var i in leadtimes) {
        leadtimes[i].lead = da[leadtimes[i].service];
        leadtimes[i].save()
          .then(() => { logger.debug("Saved leadtime: %o", leadtimes) })
          .catch(err => { logger.error("Error saving lead time %o", err); });
      }
      return leadtimes;
    });
  }
  
  set Services(da) {
    this.#services = da;
    StringListModel.findOne((err : Error, doc : HydratedDocument<{services: string[]}>) => {
      if (err || !doc || !doc.services.length) {
        logger.error("Error finding a valid services list to update.");
      }
      else {
        Object.assign(doc, da);
        doc.save()
        .then(() => { logger.debug("Saved services %o", doc) })
        .catch(err => { logger.error("Error saving services %o", err) });
      }
    });
  }

  set DeliveryArea(da) {
    this.#delivery_area = da;
    DeliveryAreaModel.findOne(function (_err : Error, db_delivery_area : HydratedDocument<GeoJSON.Polygon>) {
      Object.assign(db_delivery_area, da);
      db_delivery_area.save()
        .then(() => { logger.debug("Saved delivery area %o", db_delivery_area) })
        .catch(err => { logger.error("Error saving delivery area %o", err) });
    });
  }

  set KeyValueConfig(da) {
    this.#keyvalueconfig = da;
    KeyValueModel.findOne(function (_err : Error, db_key_values : HydratedDocument<IKeyValueStore>) {
      const settings_list = [];
      for (var i in da) {
        settings_list.push({key: i, value: da[i]});
      }
      db_key_values.settings = settings_list;
      db_key_values.save()
        .then(() => { logger.debug("Saved key/value config %o", db_key_values) })
        .catch(err => { logger.error("Error saving key/value config %o", err) });
    });
  }

  // CreateOrder(
  //   serialized_products, 
  //   customer_info, 
  //   order_metadata, 
  //   service_info) {
  //     //TODO
  // }
};

const DataProviderInstance = new DataProvider();
export default DataProviderInstance;