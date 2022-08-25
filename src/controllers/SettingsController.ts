import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';

import { DataProviderInstance } from '../config/dataprovider';
import { SocketIoProviderInstance } from '../config/socketio_provider';
import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeWriteKVStore, ScopeWriteOrderConfig } from '../config/authorization';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';
import { areKeysValidFulfillments, isFulfillmentDefined } from '../types/Validations';
import { PostBlockedOffToFulfillmentsRequest, SetLeadTimesRequest } from '@wcp/wcpshared';

const BlockOffValidationChain = [  
  body('fulfillmentIds').isArray({ min: 1 }),
  body('fulfillmentIds.*').custom(isFulfillmentDefined),
  body('date').isISO8601(),
  body('interval.start').trim().exists().isInt({min: 0, max: 1440}),
  body('interval.end').trim().exists().isInt({min: 0, max: 1440}),
];

const LeadTimeValidationChain = [  
  body().isObject().custom(areKeysValidFulfillments),
  body("*").isInt({min: 1}),
];

const SettingsValidationChain = [  
  // deprecate additional_pizza_lead_time
  body("additional_pizza_lead_time").isInt({min: 0}),
];

export class SettingsController implements IExpressController {
  public path = "/api/v1/config";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post(`${this.path}/timing/blockoff`, CheckJWT, ScopeWriteOrderConfig, expressValidationMiddleware(BlockOffValidationChain), this.postBlockedOff);
    this.router.delete(`${this.path}/timing/blockoff`, CheckJWT, ScopeWriteOrderConfig, expressValidationMiddleware(BlockOffValidationChain), this.deleteBlockedOff);
    this.router.post(`${this.path}/timing/leadtime`, CheckJWT, ScopeWriteOrderConfig, expressValidationMiddleware(LeadTimeValidationChain), this.setLeadtime);
    this.router.post(`${this.path}/settings`, CheckJWT, ScopeWriteKVStore, expressValidationMiddleware(SettingsValidationChain), this.setSettings);
  };

  private postBlockedOff = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestBody: PostBlockedOffToFulfillmentsRequest = {
        fulfillmentIds: req.body.fulfillmentIds,
        date: req.body.date,
        interval: { start: req.body.interval.start, end: req.body.interval.end }
      };
      await DataProviderInstance.postBlockedOffToFulfillments(requestBody);
      await DataProviderInstance.syncFulfillments();
      await SocketIoProviderInstance.EmitFulfillments(DataProviderInstance.Fulfillments);
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      res.setHeader('Location', location);
      return res.status(201).send(DataProviderInstance.Fulfillments);
    } catch (error) {
      next(error)
    }
  }

  private deleteBlockedOff = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestBody: PostBlockedOffToFulfillmentsRequest = {
        fulfillmentIds: req.body.fulfillmentIds,
        date: req.body.date,
        interval: { start: req.body.interval.start, end: req.body.interval.end }
      };
      await DataProviderInstance.deleteBlockedOffFromFulfillments(requestBody);
      await DataProviderInstance.syncFulfillments();
      await SocketIoProviderInstance.EmitFulfillments(DataProviderInstance.Fulfillments);
      return res.status(201).send(DataProviderInstance.Fulfillments);
    } catch (error) {
      next(error)
    }
  }

  private setLeadtime = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestBody: SetLeadTimesRequest = req.body;
      await DataProviderInstance.setLeadTimes(requestBody);
      await DataProviderInstance.syncFulfillments();
      await SocketIoProviderInstance.EmitFulfillments(DataProviderInstance.Fulfillments);
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/`;
      res.setHeader('Location', location);
      return res.status(201).send(DataProviderInstance.Fulfillments);
    } catch (error) {
      next(error)
    }
  }
  private setSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      DataProviderInstance.Settings = req.body;
      SocketIoProviderInstance.socketRO.emit('WCP_SETTINGS', DataProviderInstance.Settings);
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/`;
      res.setHeader('Location', location);
      return res.status(201).send(DataProviderInstance.Settings);
    } catch (error) {
      next(error)
    }
  }
}