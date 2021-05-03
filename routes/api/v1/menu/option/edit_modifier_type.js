const Router = require('express').Router
const { param, body, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [
  param('mtid').trim().escape().exists().isMongoId(),
  body('name').trim(),
  body('ordinal').isInt({min: 0, max:64}),
  body('min_selected').isInt({min: 0}).exists(),
  body('max_selected').optional({nullable: true}).isInt({min: 0}),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('display_flags.omit_section_if_no_available_options').toBoolean(true),
  body('display_flags.omit_options_if_not_available').toBoolean(true),
  body('display_flags.use_toggle_if_only_two_options').toBoolean(true),
  body('display_flags.hidden').toBoolean(true),
  body('display_flags.modifier_class').exists().isIn(['SIZE', 'ADD', 'SUB', 'REMOVAL', 'NOTE', 'PROMPT']),
  body('display_flags.empty_display_as').exists().isIn(['OMIT', 'YOUR_CHOICE_OF', 'LIST_CHOICES']),
  body('display_flags.template_string').exists().isAlphanumeric(),
  body('display_flags.multiple_item_separator').exists(),
  body('display_flags.non_empty_group_prefix').exists(),
  body('display_flags.non_empty_group_suffix').exists()
];

module.exports = Router({ mergeParams: true })
  .patch('/v1/menu/option/:mtid', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.UpdateModifierType(
        req.params.mtid,
        {
          name: req.body.name,
          display_name: req.body.display_name,
          ordinal: req.body.ordinal,
          min_selected: req.body.min_selected,
          max_selected: req.body.max_selected,
          revelID: req.body.revelID,
          squareID: req.body.squareID,
          display_flags: req.body.display_flags,
        }
      );
      if (!doc) {
        req.logger.info(`Unable to update ModifierType: ${req.params.mtid}`);
        return res.status(404).send(`Unable to update ModifierType: ${req.params.mtid}`);;
      }
      req.logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })