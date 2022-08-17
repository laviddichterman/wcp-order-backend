import { WProvider } from '../types/WProvider';
import logger from '../logging';
import { Namespace } from 'socket.io';
import CatalogProviderInstance from './catalog_provider';
import DataProviderInstance from './dataprovider';
import WApp from '../App';
import { format, intervalToDuration, formatDuration } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';


export class SocketIoProvider implements WProvider {
  public socketRO : Namespace;

  constructor() {
  }
  Bootstrap = (app : WApp) => {
    logger.info(`Starting Bootstrap of SocketIoProvider`);
    this.socketRO = app.getSocketIoNamespace('nsRO');

    this.socketRO.on('connect',(socket) => { 
      const connect_time = zonedTimeToUtc(Date.now(), process.env.TZ);
      socket.client.request.headers["x-real-ip"] ? 
        logger.info(`CONNECTION: Client at IP: ${socket.client.request.headers["x-real-ip"]}, UA: ${socket.client.request.headers['user-agent']}.`) : 
        logger.info(`CONNECTION: Client info: ${JSON.stringify(socket.client.request.headers)}.`);
      logger.info(`Num Connected: ${app.getSocketIoServer().engine.clientsCount}`);
      socket.emit('WCP_SERVER_TIME', { time: format(connect_time, "yyyy-MM-dd'T'HH:mm:ss"), tz: process.env.TZ });
      socket.emit('WCP_FULFILLMENTS', DataProviderInstance.Fulfillments);
      socket.emit('WCP_SETTINGS', DataProviderInstance.Settings);
      CatalogProviderInstance.EmitCatalog(socket);
      socket.on('disconnect', (reason : string) => {
        const formattedDuration = formatDuration(intervalToDuration({ start: connect_time, end: zonedTimeToUtc(Date.now(), process.env.TZ) }));
        
        socket.client.request.headers["x-real-ip"] ? 
          logger.info(`DISCONNECT: ${reason} after ${formattedDuration}. IP: ${socket.client.request.headers["x-real-ip"]}`) : 
          logger.info(`DISCONNECT: ${reason} after ${formattedDuration}.\nClient: ${JSON.stringify(socket.client.request.headers)}`);
        logger.info(`Num Connected: ${app.getSocketIoServer().engine.clientsCount}`);
      });
    });
    logger.info(`Finished Bootstrap of SocketIoProvider`);
  }
};

const SocketIoProviderInstance = new SocketIoProvider();
export default SocketIoProviderInstance;
module.exports = SocketIoProviderInstance;