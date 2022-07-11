// deletes specified product
// TODO: how do we handle when we have old orders with this product?
// maybe just disable?
import { Router } from 'express';
import { param, validationResult } from 'express-validator';
import { CheckJWT, ScopeDeleteCatalog } from '../../../../../config/authorization';

const ValidationChain = [  
  param('p_id').trim().escape().exists().isMongoId(),
  param('pi_id').trim().escape().exists().isMongoId()
];

module.exports = Router({ mergeParams: true })
  .delete('/v1/menu/product/:p_id/:pi_id', CheckJWT, ScopeDeleteCatalog, ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.DeleteProductInstance(req.params.pi_id);
      if (!doc) {
        req.logger.info(`Unable to delete ProductInstance Type: ${req.params.pi_id}`);
        return res.status(404).send(`Unable to delete ProductInstance: ${req.params.pi_id}`);
      }
      req.logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })