import { WProvider } from '../types/WProvider';
import logger from '../logging';
import { Namespace } from 'socket.io';
import CatalogProviderInstance from './catalog_provider';
import DataProviderInstance from './dataprovider';
import WApp from '../App';
import { formatDuration, intervalToDuration } from 'date-fns';


export class SocketIoProvider implements WProvider {
  public socketRO : Namespace;

  constructor() {
  }
  Bootstrap = (app : WApp) => {
    logger.info(`Starting Bootstrap of SocketIoProvider`);
    this.socketRO = app.getSocketIoNamespace('nsRO');

    this.socketRO.on('connect',(socket) => { 
      const connect_time = new Date();
      socket.client.request.headers["x-real-ip"] ? 
        logger.info(`CONNECTION: Client at IP: ${socket.client.request.headers["x-real-ip"]}, UA: ${socket.client.request.headers['user-agent']}.`) : 
        logger.info(`CONNECTION: Client info: ${JSON.stringify(socket.client.request.headers)}.`);
      logger.info(`Num Connected: ${app.getSocketIoServer().engine.clientsCount}`);
      socket.emit('WCP_SERVER_TIME', connect_time.valueOf());
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
    logger.info(`Finished Bootstrap of SocketIoProvider`);
  }
};

const SocketIoProviderInstance = new SocketIoProvider();
export default SocketIoProviderInstance;
module.exports = SocketIoProviderInstance;