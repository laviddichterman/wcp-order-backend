const WDateUtils = require("@wcp/wcpshared");
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
    this.#blocked_off = [];
    this.#leadtimes = [];
    this.#delivery_area = {};
    this.#keyvalueconfig = {};
  }
  BootstrapDatabase = (cb) => {
    logger.info("Loading from and bootstrapping to database.");

    // look for key value config area:
    this.#dbconn.KeyValueSchema.findOne((err, doc) => {
      if (err || !doc) {
        this.#keyvalueconfig = {};
        let keyvalueconfig_document = new this.#dbconn.KeyValueSchema({ settings: [] });
        keyvalueconfig_document.save()
          .then(x => { logger.info("Added default (empty) key value config area") })
          .catch(err => { logger.error("Error adding default key value config to database.", err); });
      }
      else {
        logger.debug("Found KeyValueSchema in database: ", doc);
        for (var i in doc.settings) {
          if (this.#keyvalueconfig.hasOwnProperty(doc.settings[i].key)) {
            logger.error(`Clobbering key: ${doc.settings[i].key} containing ${this.#keyvalueconfig[doc.settings[i].key]}`);
          }
          this.#keyvalueconfig[doc.settings[i].key] = doc.settings[i].value;
        }
        // call the callback since we've got all our config data now.
        cb();
      }
    });

    // look for delivery area:
    this.#dbconn.DeliveryAreaSchema.findOne((err, doc) => {
      if (err || !doc) {
        this.#delivery_area = DEFAULT_DELIVERY_AREA;
        let delivery_area_document = new this.#dbconn.DeliveryAreaSchema(DEFAULT_DELIVERY_AREA);
        delivery_area_document.save()
          .then(x => { logger.info("Added default delivery area: %o", delivery_area_document) })
          .catch(err => { logger.error("Error adding default delivery area to database.", err); });
      }
      else {
        logger.debug("Found delivery area in database: ", doc);
        this.#delivery_area = doc;
      }
    });

    // look for services
    this.#dbconn.StringListSchema.findOne((err, doc) => {
      if (err || !doc || !doc.services.length) {
        this.#services = DEFAULT_SERVICES;
        let services_document = new this.#dbconn.StringListSchema(DEFAULT_SERVICES);
        services_document.save()
          .then(x => { logger.info("Added default services list: %o", services_document) })
          .catch(err => { logger.error("Error adding default services list to database.", err); });
      }
      else {
        logger.debug("Found services in database: ", doc.services);
        this.#services = doc.services;
      }

      // check for and populate lead times
      this.#leadtimes = Array(this.#services.length).fill(null);
      this.#dbconn.LeadTimeSchema.find((err, leadtimes) => {
        if (err || !leadtimes || !leadtimes.length) {
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
          for (var i in leadtimes) {
            this.#leadtimes[leadtimes[i].service] = leadtimes[i].lead;
          }
        }
        if (leadtimes.length != this.#services.length) {
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
        return leadtimes;
      }).then(x => { });

      // check for and populate settings, including operating hours
      this.#dbconn.SettingsSchema.findOne((err, settings) => {
        if (err || !settings) {
          logger.info("No settings found, populating from defaults: %o", DEFAULT_SETTINGS);
          this.#settings = DEFAULT_SETTINGS;
          let settings_document = new this.#dbconn.SettingsSchema(DEFAULT_SETTINGS);
          settings_document.save()
            .then(x => { logger.debug("Saved settings: %o", settings_document) })
            .catch(err => { logger.error("Error saving settings %o", err) });
        }
        else {
          logger.info("Found settings: %o", settings);
          this.#settings = settings;
        }
      });

      // populate blocked off array
      this.#blocked_off = Array(this.#services.length).fill([]);
      this.#dbconn.BlockedOffSchema.findOne((err, blocked) => {
        if (err || !blocked) {
          logger.debug("No blocked off entries found. Creating blocked off array of length %o", this.#services.length);
          const blocked_off = new this.#dbconn.BlockedOffSchema({ blocked_off: [] });
          blocked_off.save()
            .then(e => { logger.debug("Saved blocked off %o", blocked_off) })
            .catch(err => { logger.error("Error saving blocked off %o", err) });
        }
        else {
          logger.debug("Found blocked off: %o", blocked);
          for (var i in blocked.blocked_off) {
            const entry = blocked.blocked_off[i];
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
      });
    });
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