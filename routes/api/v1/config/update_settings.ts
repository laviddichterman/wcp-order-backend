import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteKVStore } from '../../../../config/authorization';

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
      req.db.Settings = req.body;
      req.socket_ro.emit('WCP_SETTINGS', req.db.Settings);
      const location = `${req.base}${req.originalUrl}/${req.db.Settings._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(req.db.Settings);
    } catch (error) {
      next(error)
    }
  })