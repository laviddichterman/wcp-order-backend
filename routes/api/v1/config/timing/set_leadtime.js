import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteOrderConfig } from '../../../../../config/authorization';

const ValidationChain = [  
  body("*").isInt({min: 0}),
];

module.exports = Router({ mergeParams: true })
  .post('/v1/config/timing/leadtime', CheckJWT, ScopeWriteOrderConfig, ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      req.db.LeadTimes = req.body;
      req.socket_ro.emit('WCP_LEAD_TIMES', req.db.LeadTimes);
      const location = `${req.base}${req.originalUrl}/${req.db.LeadTimes._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(req.db.LeadTimes);
    } catch (error) {
      next(error)
    }
  })