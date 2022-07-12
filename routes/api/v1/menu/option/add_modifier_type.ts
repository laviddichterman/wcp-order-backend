// creates a new option type in the catalog
import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { CheckJWT, ScopeWriteCatalog } from '../../../../../config/authorization';

const ValidationChain = [  
  body('name').trim().exists(),
  body('display_name').trim(),
  body('ordinal').isInt({min: 0, max:63}).exists(),
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
  body('display_flags.template_string').exists().matches(/^[A-Za-z0-9]*$/),
  body('display_flags.multiple_item_separator').exists(),
  body('display_flags.non_empty_group_prefix').exists(),
  body('display_flags.non_empty_group_suffix').exists()
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/option/', CheckJWT, ScopeWriteCatalog, ValidationChain, async (req : Request, res: Response, next: NextFunction) => {
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
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        display_flags: req.body.display_flags,
      });
      const location = `${req.base}${req.originalUrl}/${doc.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      next(error)
    }
  })