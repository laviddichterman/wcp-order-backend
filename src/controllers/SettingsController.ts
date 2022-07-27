import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';

import DataProviderInstance from '../config/dataprovider';
import SocketIoProviderInstance from '../config/socketio_provider';
import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeWriteKVStore, ScopeWriteOrderConfig } from '../config/authorization';
import expressValidationMiddleware from '../middleware/expressValidationMiddleware';

const BlockOffValidationChain = [  
  //body('*.*.0').matches(WDateUtils.DATE_STRING_INTERNAL_FORMAT_REGEX),
  body('*.*.1.*.0').trim().exists().isInt({min: 0, max: 1440}),
  body('*.*.1.*.1').trim().exists().isInt({min: 0, max: 1440}),
];

const LeadTimeValidationChain = [  
  body("*").isInt({min: 0}),
];

const SettingsValidationChain = [  
  body("operating_hours.*.*.*").isInt({min: 0, max: 1440}),
  body("time_step.*").isInt({min: 1}),
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
    this.router.post(`${this.path}/timing/blockoff`, CheckJWT, ScopeWriteOrderConfig, expressValidationMiddleware(BlockOffValidationChain), this.setBlockedOff);
    this.router.post(`${this.path}/timing/leadtime`, CheckJWT, ScopeWriteOrderConfig, expressValidationMiddleware(LeadTimeValidationChain), this.setLeadtime);
    this.router.post(`${this.path}/settings`, CheckJWT, ScopeWriteKVStore, expressValidationMiddleware(SettingsValidationChain), this.setSettings);
  };

  private setBlockedOff = async (req: Request, res: Response, next: NextFunction) => {
    try {
      DataProviderInstance.BlockedOff = req.body;
      SocketIoProviderInstance.socketRO.emit('WCP_BLOCKED_OFF', DataProviderInstance.BlockedOff);
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      res.setHeader('Location', location);
      return res.status(201).send(DataProviderInstance.BlockedOff);
    } catch (error) {
      next(error)
    }
  }
  private setLeadtime = async (req: Request, res: Response, next: NextFunction) => {
    try {
      DataProviderInstance.LeadTimes = req.body;
      SocketIoProviderInstance.socketRO.emit('WCP_LEAD_TIMES', DataProviderInstance.LeadTimes);
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/`;
      res.setHeader('Location', location);
      return res.status(201).send(DataProviderInstance.LeadTimes);
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