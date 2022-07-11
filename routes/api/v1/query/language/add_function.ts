// creates a new option in the catalog
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteCatalog } from '../../../../../config/authorization';

const ValidationChain = [
  body('name').trim().exists(),
  body('expression').exists()
];

module.exports = Router({ mergeParams: true })
  .post('/v1/query/language/productinstancefunction', CheckJWT, ScopeWriteCatalog, ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.CreateProductInstanceFunction({
        name: req.body.name,
        expression: req.body.expression
      });
      if (!doc) {
        req.logger.info('Unable to create ProductInstanceFunction as requested.');
        return res.status(500).send("Unable to create ProductInstanceFunction as requested.");
      }
      const location = `${req.base}${req.originalUrl}/${doc._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      next(error)
    }
  })