import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteCatalog } from '../../../../../config/authorization';

const ValidationChain = [  
  param('fxnid').trim().escape().exists().isMongoId(), 
  body('name').trim().exists(),
  body('expression').exists()
];

module.exports = Router({ mergeParams: true })
  .patch('/v1/query/language/productinstancefunction/:fxnid', CheckJWT, ScopeWriteCatalog, ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.UpdateProductInstanceFunction(req.params.fxnid, {
        name: req.body.name,
        expression: req.body.expression
      });
      if (!doc) {
        req.logger.info(`Unable to update ProductInstanceFunction: ${req.params.fxnid}`);
        return res.status(404).send(`Unable to update ProductInstanceFunction: ${req.params.fxnid}`);;
      }
      req.logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })