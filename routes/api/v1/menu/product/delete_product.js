// deletes specified product
// TODO: how do we handle when we have old orders with this product?
// maybe just disable?

const Router = require('express').Router
const { param, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  param('p_id').trim().escape().exists().isMongoId()
];

module.exports = Router({ mergeParams: true })
  .delete('/v1/menu/product/:p_id', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.DeleteProduct(req.params.p_id);
      if (!doc) {
        req.logger.info(`Unable to delete Product: ${req.params.p_id}`);
        return res.status(404).send(`Unable to delete Product: ${req.params.p_id}`);
      }
      req.logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })