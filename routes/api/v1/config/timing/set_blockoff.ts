// creates a new category in the catalog
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteOrderConfig } from '../../../../../config/authorization';
import {WDateUtils} from '@wcp/wcpshared';
import DataProviderInstance from '../../../../../config/dataprovider';
import SocketIoProviderInstance from '../../../../../config/socketio_provider';

const ValidationChain = [  
  //body('*.*.0').matches(WDateUtils.DATE_STRING_INTERNAL_FORMAT_REGEX),
  body('*.*.1.*.0').trim().exists().isInt({min: 0, max: 1440}),
  body('*.*.1.*.1').trim().exists().isInt({min: 0, max: 1440}),
];

module.exports = Router({ mergeParams: true })
  .post('/v1/config/timing/blockoff', CheckJWT, ScopeWriteOrderConfig, ValidationChain, async (req : Request, res : Response, next : NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      DataProviderInstance.BlockedOff = req.body;
      SocketIoProviderInstance.socketRO.emit('WCP_BLOCKED_OFF', DataProviderInstance.BlockedOff);
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      res.setHeader('Location', location);
      return res.status(201).send(DataProviderInstance.BlockedOff);
    } catch (error) {
      next(error)
    }
  })