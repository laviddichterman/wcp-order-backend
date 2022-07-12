import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteKVStore } from '../../../../config/authorization';
import turf_invariant from '@turf/invariant';

const ValidationChain = [  
  body('type').equals("Polygon"),
  body('coordinates').exists(),
  body('coordinates.*.*.*').isFloat()
];

module.exports = Router({ mergeParams: true })
  .post('/v1/addresses/', 
  CheckJWT, ScopeWriteKVStore, ValidationChain, 
  async (req : Request, res : Response, next : NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const json_from_body = { type: req.body.type, coordinates: req.body.coordinates };
      try {
        turf_invariant.geojsonType(json_from_body, "Polygon", "delivery_area");
      }
      catch (e) {
        req.logger.info(`Got invalid polygon, validation error: ${e}`);
        return res.status(422).send(`Got invalid polygon, validation error: ${e}`);
      }
      req.db.DeliveryArea = json_from_body;
      req.socket_ro.emit('WCP_DELIVERY_AREA', req.db.DeliveryArea);
      const location = `${req.base}${req.originalUrl}/${req.db.DeliveryArea._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(req.db.DeliveryArea);
    } catch (error) {
      next(error)
    }
  })