// creates a new option type in the catalog
const Router = require('express').Router
const { body, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  body('name').trim().exists(),
  body('display_name').trim(),
  body('ordinal').isInt({min: 0, max:63}).exists(),
  body('min_selected').isInt({min: 0}).exists(),
  body('max_selected').optional({nullable: true}).isInt({min: 0}),
  body('enable_function').optional({nullable: true}).isMongoId(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('display_flags.omit_section_if_no_available_options').toBoolean(true),
  body('display_flags.omit_options_if_not_available').toBoolean(true),
  body('display_flags.use_toggle_if_only_two_options').toBoolean(true),
  body('display_flags.hidden').toBoolean(true),
  body('display_flags.modifier_class').exists().isIn(['SIZE', 'ADD', 'SUB', 'REMOVAL', 'NOTE', 'PROMPT']),
  body('display_flags.empty_display_as').exists().isIn(['OMIT', 'YOUR_CHOICE_OF', 'LIST_CHOICES'])
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/option/', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.CreateModifierType({
        name: req.body.name,
        display_name: req.body.display_name,
        ordinal: req.body.ordinal,
        min_selected: req.body.min_selected,
        max_selected: req.body.max_selected,
        enable_function: req.body.enable_function,
        revelID: req.body.revelID,
        squareID: req.body.squareID,
        display_flags: req.body.display_flags,
      });
      const location = `${req.base}${req.originalUrl}/${doc.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      next(error)
    }
  })