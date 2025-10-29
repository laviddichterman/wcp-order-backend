import { WProvider } from '../types/WProvider';
import logger from '../logging';
import { Namespace, Socket } from 'socket.io';
import { CatalogProviderInstance } from './catalog_provider';
import { DataProviderInstance } from './dataprovider';
import WApp from '../App';
import { format, intervalToDuration, formatDuration } from 'date-fns';
import { FulfillmentConfig, ICatalog, IWSettings, SeatingResource, WDateUtils, WOrderInstance } from '@wcp/wario-shared';
import { SocketIoJwtAuthenticateAndAuthorize } from './authorization';


export class SocketIoProvider implements WProvider {
  public socketRO: Namespace;
  public socketAuth: Namespace;
  public clientCount: number;

  constructor() {
  }

  EmitFulfillmentsTo(dest: Socket | Namespace, fulfillments: Record<string, FulfillmentConfig>) {
    return dest.emit('WCP_FULFILLMENTS', fulfillments);
  }
  EmitFulfillments(fulfillments: Record<string, FulfillmentConfig>) {
    return this.EmitFulfillmentsTo(this.socketRO, fulfillments);
  }
  EmitSeatingResourcesTo(dest: Socket | Namespace, seatingResources: Record<string, SeatingResource>) {
    return dest.emit('WCP_SEATING_RESOURCES', seatingResources);
  }
  EmitSeatingResources(seatingResources: Record<string, SeatingResource>) {
    return this.EmitSeatingResourcesTo(this.socketRO, seatingResources);
  }
  EmitSettingsTo(dest: Socket | Namespace, settings: IWSettings) {
    return dest.emit('WCP_SETTINGS', settings);
  }
  EmitSettings(settings: IWSettings) {
    return this.EmitSettingsTo(this.socketRO, settings);
  }
  EmitCatalogTo = (dest: Socket | Namespace, catalog: ICatalog) => {
    return dest.emit('WCP_CATALOG', catalog);
  }
  EmitCatalog = (catalog: ICatalog) => {
    return this.EmitCatalogTo(this.socketRO, catalog);
  }
  EmitOrderTo = (dest: Socket | Namespace, order: WOrderInstance) => {
    //return dest.emit('AUTH_ORDERS', order);
  }
  EmitOrder = (order: WOrderInstance) => {
    //return this.EmitOrderTo(this.socketAuth, order);
  }

  Bootstrap = (app: WApp) => {
    this.clientCount = 0;
    logger.info(`Starting Bootstrap of SocketIoProvider`);
    const socketRO = app.getSocketIoNamespace('nsRO');
    if (socketRO) {
      this.socketRO = socketRO;
      this.socketRO.on('connection', (socket) => {
        ++this.clientCount;
        const connect_time = Date.now();
        socket.client.request.headers["x-real-ip"] ?
          logger.info(`CONNECTION: Client at IP: ${socket.client.request.headers["x-real-ip"]}, UA: ${socket.client.request.headers['user-agent']}.`) :
          logger.info(`CONNECTION: Client info: ${JSON.stringify(socket.client.request.headers)}.`);
        logger.info(`Num Connected: ${this.clientCount}`);
        socket.emit('WCP_SERVER_TIME', { time: format(connect_time, WDateUtils.ISODateTimeNoOffset), tz: process.env.TZ! });
        this.EmitFulfillmentsTo(socket, DataProviderInstance.Fulfillments);
        this.EmitSettingsTo(socket, DataProviderInstance.Settings);
        this.EmitCatalogTo(socket, CatalogProviderInstance.Catalog);
        this.EmitSeatingResourcesTo(socket, DataProviderInstance.SeatingResources);
        socket.on('disconnect', (reason: string) => {
          --this.clientCount;
          const formattedDuration = formatDuration(intervalToDuration({ start: connect_time, end: Date.now() }));
          socket.client.request.headers["x-real-ip"] ?
            logger.info(`DISCONNECT: ${reason} after ${formattedDuration}. IP: ${socket.client.request.headers["x-real-ip"]}`) :
            logger.info(`DISCONNECT: ${reason} after ${formattedDuration}.\nClient: ${JSON.stringify(socket.client.request.headers)}`);
          logger.info(`Num Connected: ${this.clientCount}`);
        });
      });
    }

    const socketAuth = app.getSocketIoNamespace('nsAUTH');
    if (socketAuth) {
      this.socketAuth = socketAuth;
      this.socketAuth
        //.use(SocketIoJwtAuthenticateAndAuthorize(['read:order']))
        .on('connect', (socket) => {
          logger.debug(`New client authenticated with permissions: {socket.user.decodedToken.permissions}`);
        });
    }
    logger.info(`Finished Bootstrap of SocketIoProvider`);
  }
};

export const SocketIoProviderInstance = new SocketIoProvider();