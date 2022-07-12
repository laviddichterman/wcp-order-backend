import { IAbstractExpression } from '@wcp/wcpshared';
import { Router, Request, Response, NextFunction } from 'express';
import { param, body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteCatalog } from '../../../../../config/authorization';
import CatalogProviderInstance from '../../../../../config/catalog_provider';
import logger from '../../../../../logging';

const ValidationChain = [  
  param('fxnid').trim().escape().exists().isMongoId(), 
  body('name').trim().exists(),
  body('expression').exists()
];

module.exports = Router({ mergeParams: true })
  .patch('/v1/query/language/productinstancefunction/:fxnid', CheckJWT, ScopeWriteCatalog, ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.UpdateProductInstanceFunction(req.params.fxnid, {
        name: req.body.name as string,
        expression: req.body.expression as IAbstractExpression
      });
      if (!doc) {
        logger.info(`Unable to update ProductInstanceFunction: ${req.params.fxnid}`);
        return res.status(404).send(`Unable to update ProductInstanceFunction: ${req.params.fxnid}`);;
      }
      logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })