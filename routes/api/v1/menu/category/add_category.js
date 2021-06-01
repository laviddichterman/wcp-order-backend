// creates a new category in the catalog
const Router = require('express').Router
const { body, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  body('name').trim().exists(),
  body('description').trim(),
  body('subheading').trim(),
  body('footer').trim(),
  body('ordinal').exists().isInt({min: 0}),
  body('parent_id').trim().escape(),
  body('display_flags.call_line_name').trim().escape(),
  body('display_flags.call_line_display').isIn(['SHORTCODE', 'SHORTNAME'])
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/category', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const newcategory = await req.catalog.CreateCategory({
        name: req.body.name,
        ordinal: req.body.ordinal,
        description: req.body.description,
        subheading: req.body.subheading,
        footer: req.body.footer,
        parent_id: req.body.parent_id,
        display_flags: req.body.display_flags
      });
      const location = `${req.base}${req.originalUrl}/${newcategory.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(newcategory);
    } catch (error) {
      next(error)
    }
  })