import DataProviderInstance from '../../../../../config/dataprovider';
import SocketIoProviderInstance from '../../../../../config/socketio_provider';
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteOrderConfig } from '../../../../../config/authorization';

const ValidationChain = [  
  body("*").isInt({min: 0}),
];

module.exports = Router({ mergeParams: true })
  .post('/v1/config/timing/leadtime', CheckJWT, ScopeWriteOrderConfig, ValidationChain, async (req : Request, res : Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      DataProviderInstance.LeadTimes = req.body;
      SocketIoProviderInstance.socketRO.emit('WCP_LEAD_TIMES', DataProviderInstance.LeadTimes);
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/`;
      res.setHeader('Location', location);
      return res.status(201).send(DataProviderInstance.LeadTimes);
    } catch (error) {
      next(error)
    }
  })