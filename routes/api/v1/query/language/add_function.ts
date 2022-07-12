// creates a new option in the catalog
import { IAbstractExpression } from '@wcp/wcpshared';
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteCatalog } from '../../../../../config/authorization';
import CatalogProviderInstance from '../../../../../config/catalog_provider';
import logger from '../../../../../logging';

const ValidationChain = [
  body('name').trim().exists(),
  body('expression').exists()
];

module.exports = Router({ mergeParams: true })
  .post('/v1/query/language/productinstancefunction', CheckJWT, ScopeWriteCatalog, ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.CreateProductInstanceFunction({
        name: req.body.name as string,
        expression: req.body.expression as IAbstractExpression
      });
      if (!doc) {
        logger.info('Unable to create ProductInstanceFunction as requested.');
        return res.status(500).send("Unable to create ProductInstanceFunction as requested.");
      }
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${doc._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      next(error)
    }
  })