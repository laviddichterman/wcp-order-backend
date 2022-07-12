// deletes specified option type
// TODO: need to null out any references to this option type in children
// TODO: figure out if you can delete an option type with any children
// maybe just disable?

import { Router, Request, Response, NextFunction } from 'express';
import { param, validationResult } from 'express-validator';
import { CheckJWT, ScopeDeleteCatalog } from '../../../../../config/authorization';
import CatalogProviderInstance from '../../../../../config/catalog_provider';
import logger from '../../../../../logging';

const ValidationChain = [  
  param('mt_id').trim().escape().exists().isMongoId()
];

module.exports = Router({ mergeParams: true })
  .delete('/v1/menu/option/:mt_id', CheckJWT, ScopeDeleteCatalog, ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.DeleteModifierType(req.params.mt_id);
      if (!doc) {
        logger.info(`Unable to delete Modifier Type: ${req.params.mt_id}`);
        return res.status(404).send(`Unable to delete Modifier Type: ${req.params.mt_id}`);
      }
      logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })