// edits a product in the catalog
// TODO: double check that fields not passed aren't removed. 
// make it so fields that aren't present in the body are handled properly
const Router = require('express').Router
const { body, param, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  param('pid').trim().escape().exists().isMongoId(), 
  param('piid').trim().escape().exists().isMongoId(), 
  body('display_name').trim().exists(),
  body('description').trim(),
  body('shortcode').trim().escape().exists(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('disabled').custom((value) => {
    if (!value || (typeof value === 'object' && "start" in value && "end" in value && Number.isInteger(value.start) && Number.isInteger(value.end))) {
      return true;
    }
    throw new Error("Disabled value misformed");
  }),
  body('is_base').toBoolean(true),
  body('display_flags.menu.ordinal').exists().isInt({min: 0}),
  body('display_flags.menu.hide').toBoolean(true),
  body('display_flags.menu.price_display').exists().isIn(['FROM_X', 'VARIES', 'ALWAYS', 'MIN_TO_MAX', 'LIST']),
  body('display_flags.menu.adornment').trim(),
  body('display_flags.menu.suppress_exhaustive_modifier_list').toBoolean(true),
  body('display_flags.menu.show_modifier_options').toBoolean(true),
  body('display_flags.order.ordinal').exists().isInt({min: 0}),
  body('display_flags.order.hide').toBoolean(true),
  body('display_flags.order.skip_customization').toBoolean(true),
  body('display_flags.order.price_display').exists().isIn(['FROM_X', 'VARIES', 'ALWAYS', 'MIN_TO_MAX', 'LIST']),
  body('display_flags.order.adornment').trim(),
  body('display_flags.order.suppress_exhaustive_modifier_list').toBoolean(true),
  body('ordinal').exists().isInt({min: 0}),
  body('price.amount').exists().isInt({ min: 0 }),
  body('price.currency').exists().isLength({ min: 3, max: 3 }).isIn(['USD']),
  body('modifiers.*.modifier_type_id').trim().escape().exists().isMongoId(),
  body('modifiers.*.options.*.option_id').trim().escape().exists().isMongoId(),
  body('modifiers.*.options.*.placement').exists().isIn(['NONE', 'LEFT', 'RIGHT', 'WHOLE']),
  body('modifiers.*.options.*.qualifier').exists().isIn(['REGULAR', 'LITE', 'HEAVY', 'OTS'])
];

module.exports = Router({ mergeParams: true })
  .patch('/v1/menu/product/:pid/:piid', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.UpdateProductInstance(req.params.pid, req.params.piid, {
        price: req.body.price,
        description: req.body.description,
        display_name: req.body.display_name,
        shortcode: req.body.shortcode,
        disabled: req.body.disabled ? req.body.disabled : null, 
        ordinal: req.body.ordinal,
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        modifiers: req.body.modifiers,
        is_base: req.body.is_base,
        display_flags: req.body.display_flags
      });
      if (!doc) {
        req.logger.info(`Unable to update ProductInstance: ${req.params.piid}`);
        return res.status(404).send(`Unable to update ProductInstance: ${req.params.piid}`);
      }
      req.logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })