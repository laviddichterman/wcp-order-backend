const express = require('express');
const http = require("http");
const socketIo = require("socket.io");
const bodyParser = require('body-parser');
const cors = require('cors');
const WDateUtils = require("@wcp/wcpshared");
const logger = require("./logging");
const app = express();
const jwt = require('express-jwt');
const jwks = require('jwks-rsa');
const jwtAuthz = require('express-jwt-authz');
const socketioJwt = require('./forked-socketiojwt');

const authConfig = {
  domain: "lavid.auth0.com",
  audience: "https://wario.windycitypie.com"
};

const JWTKEYSTORE = jwks.expressJwtSecret({
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
  jwksUri: `https://${authConfig.domain}/.well-known/jwks.json`
});

var checkJwt = jwt({
  secret: JWTKEYSTORE,
  audience: authConfig.audience,
  issuer: `https://${authConfig.domain}/`,
  algorithms: ['RS256']
});



const server = http.createServer(app);
const io = socketIo(server);
const PORT = 4001;

let LeadTimeSchema = require('./models/lead_time.model');
let BlockedOffSchema = require('./models/blocked_off.model');
let SettingsSchema = require('./models/settings.model');
let StringListSchema = require('./models/string_list.model');
const connection = require("./config/database");

app.use(cors());
app.use(bodyParser.json());

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
          logger.debug("Adding blocked off... Service: %o Date: %o Excluded: %o", entry.service, entry.exclusion_date, entry.excluded_intervals);
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

// const functiontogetthedamnkey = (req, decodedToken, jwtheader, callback) => {
//   console.log("DECIDED TOKEN");
//   console.log(jwtheader);
//   return JWTKEYSTORE(req, decodedToken, jwtheader, callback);
// }
const wrapper = x => {
  console.log(x);
  return socketioJwt.authorize({
    secret: JWTKEYSTORE,
    timeout: 15000
  })(x);
}
BootstrapDatabase();

io.sockets.on('connect', wrapper)
  .on('authenticated', (socket) => {
    logger.info("New client authenticated. %o", socket.decoded_token);

    socket.emit('WCP_SERVICES', WCP_SERVICES);
    socket.emit('WCP_LEAD_TIMES', WCP_LEAD_TIMES);
    socket.emit('WCP_BLOCKED_OFF', WCP_BLOCKED_OFF);
    socket.emit('WCP_SETTINGS', WCP_SETTINGS);
    socket.on('WCP_SERVICES', function (msg) {
      logger.debug("Got socket message on WCP_SERVICES channel: %o", msg);
      socket.broadcast.emit('WCP_SERVICES', WCP_SERVICES);
    });
    socket.on('WCP_BLOCKED_OFF', function (msg) {
      logger.debug("Got socket message on WCP_BLOCKED_OFF channel: %o", msg);
      WCP_BLOCKED_OFF = msg;
      socket.broadcast.emit('WCP_BLOCKED_OFF', WCP_BLOCKED_OFF); 
      let blocked_off = [];
      for (var i in WCP_BLOCKED_OFF) {
        for (var j in WCP_BLOCKED_OFF[i]) {
          let excluded_intervals = [];
          for (var k in WCP_BLOCKED_OFF[i][j][1]) {
            excluded_intervals.push({start: WCP_BLOCKED_OFF[i][j][1][k][0], end: WCP_BLOCKED_OFF[i][j][1][k][1]})
          }
          blocked_off.push({service: i, exclusion_date: WCP_BLOCKED_OFF[i][j][0], excluded_intervals: excluded_intervals});
        }
      }
      logger.debug("Generated blocked off array: %o", blocked_off);
      BlockedOffSchema.findOne(function (err, db_blocked) {
        Object.assign(db_blocked, {blocked_off: blocked_off});
        db_blocked.save()
          .then(e => { logger.debug("Saved blocked off %o", db_blocked) })
          .catch(err => { logger.error("Error saving blocked off %o", err) });
      });
    });
    socket.on('WCP_LEAD_TIMES', function (msg) {
      logger.debug("Got socket message on WCP_LEAD_TIMES channel: %o", msg);
      WCP_LEAD_TIMES = msg;
      socket.broadcast.emit('WCP_LEAD_TIMES', WCP_LEAD_TIMES);
      LeadTimeSchema.find(function (err, leadtimes) {
        for (var i in leadtimes) {
          leadtimes[i].lead = WCP_LEAD_TIMES[leadtimes[i].service];
          leadtimes[i].save()
            .then(x => { logger.debug("Saved leadtime: %o", leadtimes[i]) })
            .catch(err => { logger.error("Error saving lead time %o", err); });
        }
        return leadtimes;
      });
    });
    socket.on('WCP_SETTINGS', function (msg) {
      logger.debug("Got socket message on WCP_SETTINGS channel: %o", msg);
      WCP_SETTINGS = msg;
      socket.broadcast.emit('WCP_SETTINGS', WCP_SETTINGS);
      SettingsSchema.findOne(function (err, db_settings) {
        Object.assign(db_settings, WCP_SETTINGS);
        db_settings.save()
          .then(e => { logger.debug("Saved settings %o", db_settings) })
          .catch(err => { logger.error("Error saving settings %o", err) });
      });
    });
  });

app.get("/external", checkJwt, jwtAuthz(['write:order_config']), (req, res) => {
  logger.info("hi!!! i'm in buddies!");
  res.send({
    msg: "Your Access Tokasdsadasden was successfully validated!"
  });
});

server.listen(PORT, function () {
  logger.info("Server is running on Port: " + PORT);
});

module.exports = server;