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
const PORT = process.env.PORT || 4001;
const server = http.createServer(app);
const io = socketIo(server, 
  {
    transports: ["websocket", "polling"], 
    allowEIO3: true,
    cors: {
      origin: [/https:\/\/.*\.windycitypie\.com$/, /https:\/\/.*\.breezytownpizza\.com$/, `http://localhost:${PORT}`],
      methods: ["GET", "POST"],
      credentials: true
    }
  });
const socket_ro = io.of("/nsRO");

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
  req.socket_ro = socket_ro;
  return next()
});

app.use('/api', router);

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