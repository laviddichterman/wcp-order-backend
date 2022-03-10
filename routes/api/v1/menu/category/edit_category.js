// edits a category

const Router = require('express').Router
const { param, body, validationResult } = require('express-validator');
const { CheckJWT, ScopeWriteCatalog } = require('../../../../../config/authorization');

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
  .patch('/v1/menu/category/:catid', CheckJWT, ScopeWriteCatalog, ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.UpdateCategory(
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
        req.logger.info(`Unable to update category: ${req.params.catid}`);
        return res.status(404).send(`Unable to update category: ${req.params.catid}`);
      }
      req.logger.info(`Successfully updated ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })