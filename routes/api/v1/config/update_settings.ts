import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteKVStore } from '../../../../config/authorization';
import DataProviderInstance from '../../../../config/dataprovider';
import logger from '../../../../logging';

const ValidationChain = [  
  body("operating_hours.*.*.*").isInt({min: 0, max: 1440}),
  body("time_step.*").isInt({min: 1}),
  // deprecate additional_pizza_lead_time
  body("additional_pizza_lead_time").isInt({min: 0}),
];

module.exports = Router({ mergeParams: true })
  .post('/v1/config/settings', CheckJWT, ScopeWriteKVStore, ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      DataProviderInstance.Settings = req.body;
      req.socket_ro.emit('WCP_SETTINGS', DataProviderInstance.Settings);
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${DataProviderInstance.Settings._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(DataProviderInstance.Settings);
    } catch (error) {
      next(error)
    }
  })