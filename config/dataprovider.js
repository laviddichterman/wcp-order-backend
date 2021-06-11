const { WDateUtils } = require("@wcp/wcpshared");
const logger = require('../logging');
const process = require('process');
const DEFAULT_LEAD_TIMES = require("../data/leadtimeschemas.default.json");
const DEFAULT_SETTINGS = require("../data/settingsschemas.default.json");
const DEFAULT_SERVICES = require("../data/servicesschemas.default.json");
const DEFAULT_DELIVERY_AREA = require("../data/deliveryareaschemas.default.json");

class DataProvider {
  #dbconn;
  #services;
  #settings;
  #blocked_off;
  #leadtimes;
  #delivery_area;
  #keyvalueconfig;
  constructor(dbconn) {
    this.#dbconn = dbconn;
    this.#services = null;
    this.#settings = null;
    // blocked_off is stored in the memory/wire format here of:
    // [service_index][<String, [<start, end>]>], 
    // meaning an array indexed by service_index of...
    // ... an array of two-tuples ...
    // ... whose 0th element is the string representation of the date, and whose 1th element is a list of interval tuples
    this.#blocked_off = [];
    this.#leadtimes = [];
    this.#delivery_area = {};
    this.#keyvalueconfig = {};
  }
  Bootstrap = async (cb) => {
    logger.info("Loading from and bootstrapping to database.");

    // look for key value config area:
    const found_key_value_store = await this.#dbconn.KeyValueSchema.findOne();
    if (!found_key_value_store) {
        this.#keyvalueconfig = {};
        let keyvalueconfig_document = new this.#dbconn.KeyValueSchema({ settings: [] });
        await keyvalueconfig_document.save();
        logger.info("Added default (empty) key value config area");
    }
    else {
      logger.debug("Found KeyValueSchema in database: ", found_key_value_store);
      for (var i in found_key_value_store.settings) {
        if (this.#keyvalueconfig.hasOwnProperty(found_key_value_store.settings[i].key)) {
          logger.error(`Clobbering key: ${found_key_value_store.settings[i].key} containing ${this.#keyvalueconfig[found_key_value_store.settings[i].key]}`);
        }
        this.#keyvalueconfig[found_key_value_store.settings[i].key] = found_key_value_store.settings[i].value;
      }
    }

    // look for delivery area:
    const found_delivery_area = await this.#dbconn.DeliveryAreaSchema.findOne();
    if (!found_delivery_area) {
      this.#delivery_area = DEFAULT_DELIVERY_AREA;
      let delivery_area_document = new this.#dbconn.DeliveryAreaSchema(DEFAULT_DELIVERY_AREA);
      await delivery_area_document.save();
      logger.info("Added default delivery area: %o", delivery_area_document);
    }
    else {
      logger.debug("Found delivery area in database: ", found_delivery_area);
      this.#delivery_area = found_delivery_area;
    }

    // look for services
    const found_services = await this.#dbconn.StringListSchema.findOne();
    if (!found_services || !found_services.services.length) {
      this.#services = DEFAULT_SERVICES;
      let services_document = new this.#dbconn.StringListSchema(DEFAULT_SERVICES);
      await services_document.save();
      logger.info("Added default services list: %o", services_document);
    }
    else {
      logger.debug("Found services in database: ", found_services.services);
      this.#services = found_services.services;
    }

    // check for and populate lead times
    this.#leadtimes = Array(this.#services.length).fill(null);
    const found_leadtimes = await this.#dbconn.LeadTimeSchema.find();
    if (!found_leadtimes || !found_leadtimes.length) {
      logger.info("Intializing LeadTimes with defaults.");
      for (var i in DEFAULT_LEAD_TIMES) {
        this.#leadtimes[DEFAULT_LEAD_TIMES[i].service] = DEFAULT_LEAD_TIMES[i].lead;
        let lt = new this.#dbconn.LeadTimeSchema({ service: i, lead: DEFAULT_LEAD_TIMES[i].lead });
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
    if (found_leadtimes.length != this.#services.length) {
      logger.error("we have a mismatch in service length and leadtimes stored in the DB");
    }

    //see if any leadtimes don't have a value yet and populate them
    // this is being extra safe, we shouldn't get here.
    for (var j in this.#leadtimes) {
      if (!this.#leadtimes[j]) {
        this.#leadtimes[j] = 35;
        let lt = new this.#dbconn.LeadTimeSchema({ service: j, lead: 35 });
        logger.error("Missing leadtime value! %o", lt);
        lt.save()
          .then(x => { logger.debug("Saved leadtime: %o", lt) })
          .catch(err => { logger.error("Error saving lead time for missing value %o", err) });
      }
    }

    // check for and populate settings, including operating hours
    const found_settings = await this.#dbconn.SettingsSchema.findOne();
    if (!found_settings) {
      logger.info("No settings found, populating from defaults: %o", DEFAULT_SETTINGS);
      this.#settings = DEFAULT_SETTINGS;
      let settings_document = new this.#dbconn.SettingsSchema(DEFAULT_SETTINGS);
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
    const found_blocked_off = await this.#dbconn.BlockedOffSchema.findOne();
    if (!found_blocked_off) {
      logger.debug("No blocked off entries found. Creating blocked off array of length %o", this.#services.length);
      const blocked_off = new this.#dbconn.BlockedOffSchema({ blocked_off: [] });
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
          const interval = [entry.excluded_intervals[j].start, entry.excluded_intervals[j].end];
          WDateUtils.AddIntervalToService(entry.service,
            entry.exclusion_date,
            interval,
            this.#blocked_off);
        }
      }
    }

    if (cb) {
      return await cb();
    }
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
    let new_blocked_off = [];
    for (var i in da) {
      for (var j in da[i]) {
        const excluded_intervals = [];
        for (var k in da[i][j][1]) {
          excluded_intervals.push({ start: da[i][j][1][k][0], end: da[i][j][1][k][1] })
        }
        new_blocked_off.push({ service: i, exclusion_date: da[i][j][0], excluded_intervals: excluded_intervals });
      }
    }
    logger.debug("Generated blocked off array: %o", new_blocked_off);
    this.#dbconn.BlockedOffSchema.findOne(function (err, db_blocked) {
      Object.assign(db_blocked, { blocked_off: new_blocked_off });
      db_blocked.save()
        .then(e => { logger.debug("Saved blocked off %o", db_blocked) })
        .catch(err => { logger.error("Error saving blocked off %o", err) });
    });
  }
  set Settings(da) {
    this.#settings = da;
    this.#dbconn.SettingsSchema.findOne(function (err, db_settings) {
      delete da.__v;
      Object.assign(db_settings, da);
      db_settings.save()
        .then(e => { logger.debug("Saved settings %o", db_settings) })
        .catch(err => { logger.error("Error saving settings %o", err) });
    });
  }

  set LeadTimes(da) {
    this.#leadtimes = da;
    this.#dbconn.LeadTimeSchema.find(function (err, leadtimes) {
      for (var i in leadtimes) {
        leadtimes[i].lead = da[leadtimes[i].service];
        leadtimes[i].save()
          .then(x => { logger.debug("Saved leadtime: %o", leadtimes) })
          .catch(err => { logger.error("Error saving lead time %o", err); });
      }
      return leadtimes;
    });
  }
  
  set Services(da) {
    this.#services = da;
    this.#dbconn.StringListSchema.findOne((err, doc) => {
      if (err || !doc || !doc.services.length) {
        logger.error("Error finding a valid services list to update.");
      }
      else {
        delete da.__v;
        Object.assign(doc, da);
        doc.save()
        .then(e => { logger.debug("Saved services %o", doc) })
        .catch(err => { logger.error("Error saving services %o", err) });
      }
    });
  }

  set DeliveryArea(da) {
    this.#delivery_area = da;
    this.#dbconn.DeliveryAreaSchema.findOne(function (err, db_delivery_area) {
      delete da.__v;
      Object.assign(db_delivery_area, da);
      db_delivery_area.save()
        .then(e => { logger.debug("Saved delivery area %o", db_delivery_area) })
        .catch(err => { logger.error("Error saving delivery area %o", err) });
    });
  }

  set KeyValueConfig(da) {
    this.#keyvalueconfig = da;
    this.#dbconn.KeyValueSchema.findOne(function (err, db_key_values) {
      const settings_list = [];
      for (var i in da) {
        settings_list.push({key: i, value: da[i]});
      }
      db_key_values.settings = settings_list;
      db_key_values.save()
        .then(e => { logger.debug("Saved key/value config %o", db_key_values);       process.exit(0); })
        .catch(err => { logger.error("Error saving key/value config %o", err) });
    });
  }

  CreateOrder(
    serialized_products, 
    customer_info, 
    order_metadata, 
    service_info) {
      //TODO
  }
}

module.exports = ({ dbconn }) => {
  return new DataProvider(dbconn);
}