// edits a category
import { Router, Request, Response, NextFunction } from 'express';
import { param, body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteCatalog } from '../../../../../config/authorization';
import CatalogProviderInstance from '../../../../../config/catalog_provider';
import logger from '../../../../../logging';

const ValidationChain = [
  param('catid').trim().escape().exists(),
  body('name').trim().exists(),
  body('description').trim(),
  body('subheading').trim(),
  body('footnotes').trim(),
  body('ordinal').exists().isInt({min: 0}),
  body('parent_id').trim().escape(),
  body('display_flags.call_line_name').trim().escape(),
  body('display_flags.call_line_display').isIn(['SHORTCODE', 'SHORTNAME'])
];

module.exports = Router({ mergeParams: true })
  .patch('/v1/menu/category/:catid', CheckJWT, ScopeWriteCatalog, ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await CatalogProviderInstance.UpdateCategory(
        req.params.catid, 
        {
          name: req.body.name,
          ordinal: req.body.ordinal,
          description: req.body.description,
          subheading: req.body.subheading,
          footnotes: req.body.footnotes,
          parent_id: req.body.parent_id,
          display_flags: req.body.display_flags
        });
      if (!doc) {
        logger.info(`Unable to update category: ${req.params.catid}`);
        return res.status(404).send(`Unable to update category: ${req.params.catid}`);
      }
      logger.info(`Successfully updated ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })