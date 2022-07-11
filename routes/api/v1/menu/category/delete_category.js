// deletes specified category
// TODO: need to null out any references to this category in children
// TODO: figure out if you can delete a category with any children (either products or other categories)

import { Router } from 'express';
import { param, validationResult } from 'express-validator';
import { CheckJWT, ScopeDeleteCatalog } from '../../../../../config/authorization';

const ValidationChain = [  
  param('catid').trim().escape().exists()
];


module.exports = Router({ mergeParams: true })
  .delete('/v1/menu/category/:catid', CheckJWT, ScopeDeleteCatalog, ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.DeleteCategory(req.params.catid);
      if (!doc) {
        req.logger.info(`Unable to delete category: ${req.params.catid}`);
        return res.status(404).send(`Unable to delete category: ${req.params.catid}`);
      }
      req.logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })