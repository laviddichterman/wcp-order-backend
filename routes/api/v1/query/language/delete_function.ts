// deletes specified function
import { Router, Request, Response, NextFunction } from 'express';
import { param, validationResult } from 'express-validator';
import { CheckJWT, ScopeDeleteCatalog } from '../../../../../config/authorization';
import CatalogProviderInstance from '../../../../../config/catalog_provider';
import logger from '../../../../../logging';

const ValidationChain = [  
  param('fxnid').trim().escape().exists().isMongoId(),
];

module.exports = Router({ mergeParams: true })
  .delete('/v1/query/language/productinstancefunction/:fxnid', CheckJWT, ScopeDeleteCatalog, ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.DeleteProductInstanceFunction(req.params.fxnid);
      if (!doc) {
        logger.info(`Unable to delete ProductInstanceFunction: ${req.params.fxnid}`);
        return res.status(404).send(`Unable to delete ProductInstanceFunction: ${req.params.fxnid}`);
      }
      logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })