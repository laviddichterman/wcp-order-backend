// deletes specified function

const Router = require('express').Router
const { param, validationResult } = require('express-validator');
const { CheckJWT, ScopeDeleteCatalog} = require('../../../../../config/authorization');

const ValidationChain = [  
  param('fxnid').trim().escape().exists().isMongoId(),
];

module.exports = Router({ mergeParams: true })
  .delete('/v1/query/language/productinstancefunction/:fxnid', CheckJWT, ScopeDeleteCatalog, ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.DeleteProductInstanceFunction(req.params.fxnid);
      if (!doc) {
        req.logger.info(`Unable to delete ProductInstanceFunction: ${req.params.fxnid}`);
        return res.status(404).send(`Unable to delete ProductInstanceFunction: ${req.params.fxnid}`);
      }
      req.logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })