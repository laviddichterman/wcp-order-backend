const express = require('express');
const http = require("http");
const socketIo = require("socket.io");
const bodyParser = require('body-parser');
const moment = require('moment');
const cors = require('cors');
const logger = require("./logging");
const app = express();
const idempotency = require('express-idempotency');
const expressWinston = require('express-winston')
const router = require('./routes/')()

const server = http.createServer(app);
const io = socketIo(server);
const socket_auth = io.of("/nsAuth");
const socket_ro = io.of("/nsRO");

const PORT = process.env.PORT || 4001;
const { SocketIoJwtAuthenticateAndAuthorize } = require('./config/authorization');
//const jwtAuthz = require('express-jwt-authz');

const DatabaseConnection = require('./create_database')({ logger })
const DatabaseManager = require("./config/database_manager")({ dbconn: DatabaseConnection });
const DataProvider = require("./config/dataprovider")({ dbconn: DatabaseConnection });
const CatalogProvider = require("./config/catalog_provider")({socketRO: socket_ro, dbconn: DatabaseConnection});
const GoogleProvider = require("./config/google");
const SquareProvider = require("./config/square");
const StoreCreditProvider = require("./config/store_credit_provider");

// needs to run first
DatabaseManager.Bootstrap(async () => {
  DataProvider.Bootstrap(async () => {
    await GoogleProvider.BootstrapProvider(DataProvider);
    SquareProvider.BootstrapProvider(DataProvider);
    StoreCreditProvider.BootstrapProvider(DataProvider);
  });
  await CatalogProvider.Bootstrap();  
});

app.use(idempotency.idempotency());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(expressWinston.logger({
  winstonInstance: logger,
  msg: '{{res.statusCode}} {{req.method}} {{req.url}} {{res.responseTime}}ms',
  meta: false,
}));
app.use((req, res, next) => {
  req.base = `${req.protocol}://${req.get('host')}`
  req.logger = logger;
  req.db = DataProvider;
  req.catalog = CatalogProvider;
  return next()
});

app.use('/api', router);

// handle authenticated socketIO
socket_auth.on('connect', SocketIoJwtAuthenticateAndAuthorize(['read:order_config', 'write:order_config']))
  .on('authenticated', (socket) => {
    logger.debug(`New client authenticated with permissions: ${socket.decoded_token.permissions}`);
    socket.emit('AUTH_KEYVALUES', DataProvider.KeyValueConfig);
    socket.on('AUTH_SERVICES', function (msg) {
      logger.error("SOMEHOW Got socket message on AUTH_SERVICES channel: %o", msg);
      //socket_ro.emit('WCP_SERVICES', DataProvider.Services);
    });
    socket.on('AUTH_BLOCKED_OFF', function (msg) {
      logger.debug("Got socket message on AUTH_BLOCKED_OFF channel: %o", msg);
      DataProvider.BlockedOff = msg;
      socket_ro.emit('WCP_BLOCKED_OFF', DataProvider.BlockedOff);
    });
    socket.on('AUTH_LEAD_TIMES', function (msg) {
      logger.debug("Got socket message on AUTH_LEAD_TIMES channel: %o", msg);
      DataProvider.LeadTimes = msg;
      socket_ro.emit('WCP_LEAD_TIMES', DataProvider.LeadTimes);
    });
    socket.on('AUTH_SETTINGS', function (msg) {
      logger.debug("Got socket message on AUTH_SETTINGS channel: %o", msg);
      DataProvider.Settings = msg;
      socket_ro.emit('WCP_SETTINGS', DataProvider.Settings);
    });
    socket.on('AUTH_DELIVERY_AREA', function (msg) {
      logger.debug("Got socket message on AUTH_DELIVERY_AREA channel: %o", msg);
      DataProvider.DeliveryArea = msg;
      socket_ro.emit('WCP_DELIVERY_AREA', DataProvider.DeliveryArea);
    });
    socket.on('AUTH_KEYVALUES', function (msg) {
      logger.debug("Got socket message on AUTH_KEYVALUES channel: %o", msg);
      DataProvider.KeyValueConfig = msg;
      socket.broadcast.emit('AUTH_KEYVALUES', DataProvider.KeyValueConfig);
    });
  });

socket_ro.on('connect',(socket) => { 
  const connect_time = new moment();
  socket.client.request.headers["x-real-ip"] ? 
    logger.info(`CONNECTION: Client at IP: ${socket.client.request.headers["x-real-ip"]}, UA: ${socket.client.request.headers['user-agent']}.`) : 
    logger.info(`CONNECTION: Client info: ${JSON.stringify(socket.client.request.headers)}.`);
  logger.info(`Num Connected: ${io.engine.clientsCount}`);

  socket.emit('WCP_SERVICES', DataProvider.Services);
  socket.emit('WCP_LEAD_TIMES', DataProvider.LeadTimes);
  socket.emit('WCP_BLOCKED_OFF', DataProvider.BlockedOff);
  socket.emit('WCP_SETTINGS', DataProvider.Settings);
  socket.emit('WCP_DELIVERY_AREA', DataProvider.DeliveryArea);
  CatalogProvider.EmitCatalog(socket);
  socket.on('disconnect', (reason) => {
    const disconnect_time = new moment();
    const duration = moment.duration(disconnect_time.diff(connect_time));
    socket.client.request.headers["x-real-ip"] ? 
      logger.info(`DISCONNECT: ${reason} after ${Number(duration.as("minutes")).toFixed(2)} minutes. IP: ${socket.client.request.headers["x-real-ip"]}`) : 
      logger.info(`DISCONNECT: ${reason} after ${Number(duration.as("minutes")).toFixed(2)} minutes.\nClient: ${JSON.stringify(socket.client.request.headers)}`);
    logger.info(`Num Connected: ${io.engine.clientsCount}`);
  });
});



server.listen(PORT, function () {
  logger.info("Server is running on Port: " + PORT);
});

module.exports = server;