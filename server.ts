require('dotenv').config();

import express from 'express';
import http from "http";
import socketIo from "socket.io";
import bodyParser from 'body-parser';
import cors from 'cors';
import idempotency from 'express-idempotency';
import expressWinston from 'express-winston';
import { intervalToDuration, formatDuration } from 'date-fns';
import logger from "./logging";
import { GenerateRouter } from './routes';
import GoogleProvider from "./config/google";
import SquareProvider from "./config/square";
import StoreCreditProvider from "./config/store_credit_provider";
import DatabaseConnectionConstructor from './create_database';
import DatabaseManagerConstructor from "./config/database_manager";
import DataProviderConstructor from "./config/dataprovider";
import CatalogProviderConstructor from "./config/catalog_provider";


const router = GenerateRouter();

const ORIGINS = [/https:\/\/.*\.windycitypie\.com$/, /https:\/\/.*\.breezytownpizza\.com$/, `http://localhost:${PORT}`];
const PORT = process.env.PORT || 4001;
const app = express();
const server = http.createServer(app);
const io = new socketIo.Server(server, 
  {
    transports: ["websocket", "polling"], 
    allowEIO3: true,
    cors: {
      origin: ORIGINS,
      methods: ["GET", "POST"],
      credentials: true
    }
  });
const socket_ro = io.of("/nsRO");

const DatabaseConnection = DatabaseConnectionConstructor({ logger });
const DatabaseManager = DatabaseManagerConstructor({ dbconn: DatabaseConnection });
const DataProvider = DataProviderConstructor({ dbconn: DatabaseConnection });
const CatalogProvider = CatalogProviderConstructor({socketRO: socket_ro, dbconn: DatabaseConnection});
const GoogleProviderInstance = new GoogleProvider();
const SquareProviderInstance = new SquareProvider();


// needs to run first
DatabaseManager.Bootstrap(async () => {
  DataProvider.Bootstrap(async () => {
    await GoogleProviderInstance.BootstrapProvider(DataProvider);
    SquareProviderInstance.BootstrapProvider(DataProvider);
    StoreCreditProvider.BootstrapProvider(DataProvider);
  });
  await CatalogProvider.Bootstrap();  
});

app.use(idempotency.idempotency());
app.use(cors({origin: ORIGINS}));
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
  const connect_time = new Date();
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
  socket.on('disconnect', (reason : string) => {
    const formattedDuration = formatDuration(intervalToDuration({ start: connect_time, end: new Date()}));
    
    socket.client.request.headers["x-real-ip"] ? 
      logger.info(`DISCONNECT: ${reason} after ${formattedDuration}. IP: ${socket.client.request.headers["x-real-ip"]}`) : 
      logger.info(`DISCONNECT: ${reason} after ${formattedDuration}.\nClient: ${JSON.stringify(socket.client.request.headers)}`);
    logger.info(`Num Connected: ${io.engine.clientsCount}`);
  });
});



server.listen(PORT, function () {
  logger.info("Server is running on Port: " + PORT);
});

module.exports = server;