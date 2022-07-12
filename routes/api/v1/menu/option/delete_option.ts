// deletes specified option
// TODO: need to null out any references to this option in products
// TODO: figure out if you can delete an option type with any children
// maybe just disable?

import { Router, Request, Response, NextFunction } from 'express';
import { param, validationResult } from 'express-validator';
import { CheckJWT, ScopeDeleteCatalog } from '../../../../../config/authorization';
import CatalogProviderInstance from '../../../../../config/catalog_provider';
import logger from '../../../../../logging';

const ValidationChain = [  
  param('otid').trim().escape().exists().isMongoId(),
  param('oid').trim().escape().exists().isMongoId()
];

module.exports = Router({ mergeParams: true })
  .delete('/v1/menu/option/:otid/:oid', CheckJWT, ScopeDeleteCatalog, ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.DeleteModifierOption(req.params.oid);
      if (!doc) {
        logger.info(`Unable to delete Modifier Option: ${req.params.oid}`);
        return res.status(404).send(`Unable to delete Modifier Option: ${req.params.oid}`);
      }
      logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })