const Router = require('express').Router
const { body, param, validationResult } = require('express-validator');
const { CheckJWT, ScopeWriteKVStore } = require('../../../../config/authorization');

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

module.exports = Router({ mergeParams: true })
  .post('/v1/config/kvstore', CheckJWT, ScopeWriteKVStore, ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      req.db.KeyValueConfig = req.body;
      //req.???.emit('AUTH_KEYVALUES', req.db.DeliveryArea); not sure how to signal that new config is available
      const location = `${req.base}${req.originalUrl}/${req.db.KeyValueConfig._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(req.db.KeyValueConfig);
    } catch (error) {
      next(error)
    }
  })