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
import DatabaseConnectionCreator from './create_database';
import DatabaseManager from "./config/database_manager";
import DataProvider from "./config/dataprovider";
import CatalogProvider from "./config/catalog_provider";

const PORT = process.env.PORT || 4001;
const ORIGINS = [/https:\/\/.*\.windycitypie\.com$/, /https:\/\/.*\.breezytownpizza\.com$/, `http://localhost:${PORT}`];

const router = GenerateRouter();
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

DatabaseConnectionCreator({ logger });
const DatabaseManagerInstance = new DatabaseManager();
const DataProviderInstance = new DataProvider();
const CatalogProviderInstance = new CatalogProvider(socket_ro);
const GoogleProviderInstance = new GoogleProvider();
const SquareProviderInstance = new SquareProvider();
const StoreCreditProviderInstance = new StoreCreditProvider();


// needs to run first
DatabaseManagerInstance.Bootstrap(async () => {
  DataProviderInstance.Bootstrap(async () => {
    await GoogleProviderInstance.BootstrapProvider(DataProviderInstance);
    SquareProviderInstance.BootstrapProvider(DataProviderInstance);
    StoreCreditProviderInstance.BootstrapProvider(DataProviderInstance, GoogleProviderInstance);
  });
  await CatalogProviderInstance.Bootstrap(null);  
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
  req.db = DataProviderInstance;
  req.catalog = CatalogProviderInstance;
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

  socket.emit('WCP_SERVICES', DataProviderInstance.Services);
  socket.emit('WCP_LEAD_TIMES', DataProviderInstance.LeadTimes);
  socket.emit('WCP_BLOCKED_OFF', DataProviderInstance.BlockedOff);
  socket.emit('WCP_SETTINGS', DataProviderInstance.Settings);
  socket.emit('WCP_DELIVERY_AREA', DataProviderInstance.DeliveryArea);
  CatalogProviderInstance.EmitCatalog(socket);
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