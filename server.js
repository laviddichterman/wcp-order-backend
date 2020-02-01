const express = require('express');
const http = require("http");
const socketIo = require("socket.io");
const bodyParser = require('body-parser');
const cors = require('cors');
const logger = require("./logging");
const app = express();
const routes = require('./routes');

const server = http.createServer(app);
const io = socketIo(server);
const PORT = 4001;
const { CheckJWT, JWTKeyStore } = require('./config/authorization');
const socketioJwt = require('./forked-socketiojwt');
const jwtAuthz = require('express-jwt-authz');

const LeadTimeSchema = require('./models/lead_time.model');
const BlockedOffSchema = require('./models/blocked_off.model');
const SettingsSchema = require('./models/settings.model');
const StringListSchema = require('./models/string_list.model');
const DataProvider = require("./config/database");

app.use(cors());
app.use(bodyParser.json());
app.use('/', routes);

io.sockets.
  on('connect', socketioJwt.authorize({
    secret: JWTKeyStore,
    timeout: 15000
  }))
  .on('authenticated', (socket) => {
    logger.debug("New client authenticated. %o", socket.decoded_token.sub);
    socket.emit('WCP_SERVICES', DataProvider.Services);
    socket.emit('WCP_LEAD_TIMES', DataProvider.LeadTimes);
    socket.emit('WCP_BLOCKED_OFF', DataProvider.BlockedOff);
    socket.emit('WCP_SETTINGS', DataProvider.Settings);
    socket.on('WCP_SERVICES', function (msg) {
      logger.error("SOMEHOW Got socket message on DataProvider.Services channel: %o", msg);
      //socket.broadcast.emit('WCP_SERVICES', DataProvider.Services);
    });
    socket.on('WCP_BLOCKED_OFF', function (msg) {
      logger.debug("Got socket message on WCP_BLOCKED_OFF channel: %o", msg);
      DataProvider.BlockedOff = msg;
      socket.broadcast.emit('WCP_BLOCKED_OFF', msg); 
    });
    socket.on('WCP_LEAD_TIMES', function (msg) {
      logger.debug("Got socket message on WCP_LEAD_TIMES channel: %o", msg);
      DataProvider.LeadTimes = msg;
      socket.broadcast.emit('WCP_LEAD_TIMES', WCP_LEAD_TIMES);
    });
    socket.on('WCP_SETTINGS', function (msg) {
      logger.debug("Got socket message on WCP_SETTINGS channel: %o", msg);
      DataProvider.Settings = msg;
      socket.broadcast.emit('WCP_SETTINGS', WCP_SETTINGS);
    });
  });

app.get("/external", CheckJWT, jwtAuthz(['write:order_config']), (req, res) => {
  logger.info("hi!!! i'm in buddies!");
  res.send({
    msg: "Your Access Tokasdsadasden was successfully validated!"
  });
});

server.listen(PORT, function () {
  logger.info("Server is running on Port: " + PORT);
});

module.exports = server;