let LeadTimeSchema = require('./models/lead_time.model');
let BlockedOffSchema = require('./models/blocked_off.model');
let SettingsSchema = require('./models/settings.model');
let StringListSchema = require('./models/string_list.model');

let WCP_SERVICES;
let WCP_LEAD_TIMES;
let WCP_SETTINGS;
let WCP_BLOCKED_OFF;

// check if the database is bootstrapped and if not, load with defaults
function BootstrapDatabase() {
  logger.info("Loading from and bootstrapping to database");
  const DEFAULT_LEAD_TIMES = require("./data/leadtimeschemas.default.json");
  const DEFAULT_SETTINGS = require("./data/settingsschemas.default.json");
  const DEFAULT_SERVICES = require("./data/servicesschemas.default.json");
  console.log(DEFAULT_SERVICES);
  // look for services
  StringListSchema.findOne(function (err, doc) {
    if (err || !doc || !doc.services.length) {
      WCP_SERVICES = DEFAULT_SERVICES;
      let services_document = new StringListSchema(DEFAULT_SERVICES);
      services_document.save()
        .then(x => { logger.info("Added default services list: %o", services_document) })
        .catch(err => { logger.error("Error adding default services list to database.", err); });
    }
    else {
      logger.debug("Found services in database: ", doc.services);
      WCP_SERVICES = doc.services;
    }

    // check for and populate lead times
    WCP_LEAD_TIMES = Array(WCP_SERVICES.length).fill(null);
    LeadTimeSchema.find(function (err, leadtimes) {
      if (err || !leadtimes || !leadtimes.length) {
        logger.info("Intializing LeadTimes with defaults.");
        for (var i in DEFAULT_LEAD_TIMES) {
          WCP_LEAD_TIMES[DEFAULT_LEAD_TIMES[i].service] = DEFAULT_LEAD_TIMES[i].lead;
          let lt = new LeadTimeSchema({ service: i, lead: DEFAULT_LEAD_TIMES[i].lead });
          lt.save()
            .then(x => { logger.debug("Saved lead time of %o", lt) })
            .catch(err => { logger.error("Error saving lead time %o", err); });
        }
      }
      else {
        for (var i in leadtimes) {
          WCP_LEAD_TIMES[leadtimes[i].service] = leadtimes[i].lead;
        }
      }
      if (leadtimes.length != WCP_SERVICES.length) { 
        logger.error("we have a mismatch in service length and leadtimes stored in the DB");
      }

      //see if any leadtimes don't have a value yet and populate them
      // this is being extra safe, we shouldn't get here.
      for (var j in WCP_LEAD_TIMES) {
        if (!WCP_LEAD_TIMES[j]) {
          WCP_LEAD_TIMES[j] = 35;
          let lt = new LeadTimeSchema({ service: j, lead: 35 });
          logger.error("Missing leadtime value! %o", lt);
          lt.save()
            .then(x => { logger.debug("Saved leadtime: %o", lt) })
            .catch(err => { logger.error("Error saving lead time for missing value %o", err) });
        }
      }
      return leadtimes;
    }).then(x => { });

    // check for and populate settings, including operating hours
    SettingsSchema.findOne(function (err, settings) {
      if (err || !settings) {
        logger.info("No settings found, populating from defaults: %o", DEFAULT_SETTINGS);
        WCP_SETTINGS = DEFAULT_SETTINGS;
        let settings_document = new SettingsSchema(DEFAULT_SETTINGS);
        settings_document.save()
          .then(x => { logger.debug("Saved settings: %o", settings_document) })
          .catch(err => { logger.error("Error saving settings %o", err) });
      }
      else {
        logger.info("Found settings: %o", settings);
        console.log(settings);
        WCP_SETTINGS = settings;
      }
    });

    // populate blocked off array
    WCP_BLOCKED_OFF = Array(WCP_SERVICES.length).fill([]);
    BlockedOffSchema.findOne(function (err, blocked) {
      if (err || !blocked) {
        logger.debug("No blocked off entries found. Creating blocked off array of length %o", WCP_SERVICES.length);
        const blocked_off = new BlockedOffSchema({blocked_off: []});
        blocked_off.save()
          .then(e => { logger.debug("Saved blocked off %o", blocked_off) })
          .catch(err => { logger.error("Error saving blocked off %o", err) });
      }
      else {
        logger.debug("Found blocked off: %o", blocked);
        for (var i in blocked.blocked_off) {
          const entry = blocked.blocked_off[i];
          logger.debug("Adding blocked off: %o", entry[i]);
          for (var j in entry.excluded_intervals) {
            const interval = [entry.excluded_intervals[j].start, entry.excluded_intervals[j].end];
            WDateUtils.AddIntervalToService(entry.service,
              entry.exclusion_date,
              interval,
              WCP_BLOCKED_OFF);
          }
        }
      }
    });
  });
}