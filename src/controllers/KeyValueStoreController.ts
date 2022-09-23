import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

import { DataProviderInstance } from '../config/dataprovider';
import IExpressController from '../types/IExpressController';
import { CheckJWT, ScopeReadKVStore, ScopeWriteKVStore } from '../config/authorization';

const ValidationChain = [  
  body().custom((value) => {
    if (typeof value === 'object') {
      Object.keys(value).forEach(x => {
        if (typeof value[x] !== 'string') {
          throw new Error(`Misformed value found for key ${x}.`);
        }
      })      
      return true;
    }
    throw new Error("Body not an object");
  }),
];
export class KeyValueStoreController implements IExpressController {
  public path = "/api/v1/config/kvstore";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}`, CheckJWT, ScopeReadKVStore, this.getKvStore);
    this.router.post(`${this.path}`, CheckJWT, ScopeWriteKVStore, ValidationChain, this.setKvStore);
  };

  private getKvStore = async (request: Request, response: Response, next: NextFunction) => {
    try {
      return response.status(200).send(DataProviderInstance.KeyValueConfig);
    } catch (error) {
      return next(error)
    }
  }

  private setKvStore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      DataProviderInstance.KeyValueConfig = req.body;
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/`;
      res.setHeader('Location', location);
      return res.status(201).send(DataProviderInstance.KeyValueConfig);
    } catch (error) {
      return next(error)
    }
  }
}