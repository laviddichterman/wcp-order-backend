import { WProvider } from '../types/WProvider';
import logger from '../logging';
import { Namespace, Socket } from 'socket.io';
import { CatalogProviderInstance } from './catalog_provider';
import { DataProviderInstance } from './dataprovider';
import WApp from '../App';
import { format, intervalToDuration, formatDuration } from 'date-fns';
import { zonedTimeToUtc } from 'date-fns-tz';
import { FulfillmentConfig, ICatalog, IWSettings, WDateUtils, WOrderInstance } from '@wcp/wcpshared';
import { SocketIoJwtAuthenticateAndAuthorize } from './authorization';


export class SocketIoProvider implements WProvider {
  public socketRO: Namespace;
  public socketAuth: Namespace;

  constructor() {
  }

  EmitFulfillmentsTo(dest: Socket | Namespace, fulfillments: Record<string, FulfillmentConfig>) {
    return dest.emit('WCP_FULFILLMENTS', fulfillments);
  }
  EmitFulfillments(fulfillments: Record<string, FulfillmentConfig>) {
    return this.EmitFulfillmentsTo(this.socketRO, fulfillments);
  }
  EmitSettingsTo(dest: Socket | Namespace, settings: IWSettings) {
    return this.socketRO.emit('WCP_SETTINGS', settings);
  }
  EmitSettings(settings: IWSettings) {
    return this.EmitSettingsTo(this.socketRO, settings);
  }
  EmitCatalogTo = (dest: Socket | Namespace, catalog: ICatalog) => {
    return this.socketRO.emit('WCP_CATALOG', catalog);
  }
  EmitCatalog = (catalog: ICatalog) => {
    return this.EmitCatalogTo(this.socketRO, catalog);
  }
  EmitOrderTo = (dest: Socket | Namespace, order: WOrderInstance) => {
    return this.socketAuth.emit('AUTH_ORDERS', order);
  }
  EmitOrder = (order: WOrderInstance) => {
    return this.EmitOrderTo(this.socketAuth, order);
  }

  Bootstrap = (app: WApp) => {
    logger.info(`Starting Bootstrap of SocketIoProvider`);
    this.socketRO = app.getSocketIoNamespace('nsRO');

    this.socketRO.on('connect', (socket) => {
      const connect_time = zonedTimeToUtc(Date.now(), process.env.TZ);
      socket.client.request.headers["x-real-ip"] ?
        logger.info(`CONNECTION: Client at IP: ${socket.client.request.headers["x-real-ip"]}, UA: ${socket.client.request.headers['user-agent']}.`) :
        logger.info(`CONNECTION: Client info: ${JSON.stringify(socket.client.request.headers)}.`);
      logger.info(`Num Connected: ${app.getSocketIoServer().engine.clientsCount}`);
      socket.emit('WCP_SERVER_TIME', { time: format(connect_time, WDateUtils.ISODateTimeNoOffset), tz: process.env.TZ });
      this.EmitFulfillmentsTo(socket, DataProviderInstance.Fulfillments);
      this.EmitSettingsTo(socket, DataProviderInstance.Settings);
      this.EmitCatalogTo(socket, CatalogProviderInstance.Catalog);
      socket.on('disconnect', (reason: string) => {
        const formattedDuration = formatDuration(intervalToDuration({ start: connect_time, end: zonedTimeToUtc(Date.now(), process.env.TZ) }));

        socket.client.request.headers["x-real-ip"] ?
          logger.info(`DISCONNECT: ${reason} after ${formattedDuration}. IP: ${socket.client.request.headers["x-real-ip"]}`) :
          logger.info(`DISCONNECT: ${reason} after ${formattedDuration}.\nClient: ${JSON.stringify(socket.client.request.headers)}`);
        logger.info(`Num Connected: ${app.getSocketIoServer().engine.clientsCount}`);
      });
    });

    this.socketAuth = app.getSocketIoNamespace('nsAUTH');
    this.socketAuth
    //.use(SocketIoJwtAuthenticateAndAuthorize(['read:order']))
    .on('connect', (socket) => {
      logger.debug(`New client authenticated with permissions: {socket.user.decodedToken.permissions}`);
    });
    logger.info(`Finished Bootstrap of SocketIoProvider`);
  }
};

export const SocketIoProviderInstance = new SocketIoProvider();