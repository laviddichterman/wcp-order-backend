require('dotenv').config();

import { intervalToDuration, formatDuration } from 'date-fns';
import logger from "./logging";
import { GenerateRouter } from './routes';
import GoogleProvider from "./config/google";
import SquareProvider from "./config/square";
import StoreCreditProvider from "./config/store_credit_provider";
import DatabaseManagerInstance from "./config/database_manager";
import DataProviderInstance from "./config/dataprovider";
import CatalogProviderInstance from "./config/catalog_provider";
import WApp from './App';

const app = new WApp(["nsRO"],
  [
    // new PostController(),
    // new AuthenticationController(),
    // new UserController(),
    // new ReportController(),
  ],
  [DatabaseManagerInstance, DataProviderInstance, GoogleProvider, SquareProvider, CatalogProviderInstance]
);








socket_ro.on('connect',(socket) => { 
  const connect_time = new Date();
  socket.client.request.headers["x-real-ip"] ? 
    logger.info(`CONNECTION: Client at IP: ${socket.client.request.headers["x-real-ip"]}, UA: ${socket.client.request.headers['user-agent']}.`) : 
    logger.info(`CONNECTION: Client info: ${JSON.stringify(socket.client.request.headers)}.`);
  logger.info(`Num Connected: ${app.getSocketIoServer().engine.clientsCount}`);

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
    logger.info(`Num Connected: ${app.getSocketIoServer().engine.clientsCount}`);
  });
});


app.listen();

module.exports = app;