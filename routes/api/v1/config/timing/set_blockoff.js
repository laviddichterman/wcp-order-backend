// creates a new category in the catalog
const Router = require('express').Router
const { body, param, validationResult } = require('express-validator');
const { CheckJWT, ScopeWriteOrderConfig } = require('../../../../../config/authorization');
const wcpshared = require("@wcp/wcpshared");

const ValidationChain = [  
  body('*.*.0').matches(wcpshared.WDateUtils.DATE_STRING_INTERNAL_FORMAT_REGEX),
  body('*.*.1.*.0').trim().exists().isInt({min: 0, max: 1440}),
  body('*.*.1.*.1').trim().exists().isInt({min: 0, max: 1440}),
];

module.exports = Router({ mergeParams: true })
  .post('/v1/config/timing/blockoff', CheckJWT, ScopeWriteOrderConfig, ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      req.db.BlockedOff = req.body;
      req.socket_ro.emit('WCP_BLOCKED_OFF', req.db.BlockedOff);
      const location = `${req.base}${req.originalUrl}/${req.db.BlockedOff._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(req.db.BlockedOff);
    } catch (error) {
      next(error)
    }
  })