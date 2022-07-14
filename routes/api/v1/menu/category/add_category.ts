// creates a new category in the catalog
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteCatalog } from '../../../../../config/authorization';
import CatalogProviderInstance from '../../../../../config/catalog_provider';
import logger from '../../../../../logging';

const ValidationChain = [  
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
  .post('/v1/menu/category', CheckJWT, ScopeWriteCatalog, ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const newcategory = await CatalogProviderInstance.CreateCategory({
        name: req.body.name,
        ordinal: req.body.ordinal,
        description: req.body.description,
        subheading: req.body.subheading,
        footnotes: req.body.footnotes,
        parent_id: req.body.parent_id,
        display_flags: req.body.display_flags
      });
      const location = `${req.protocol}://${req.get('host')}${req.originalUrl}/${newcategory.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(newcategory);
    } catch (error) {
      next(error)
    }
  })