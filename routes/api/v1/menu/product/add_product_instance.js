// creates a new option in the catalog
const Router = require('express').Router
const { body, param, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [
  param('pid').trim().escape().exists().isMongoId(), 
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
  body('display_flags.order.ordinal').exists().isInt({min: 0}),
  body('display_flags.order.hide').toBoolean(true),
  body('display_flags.order.skip_customization').toBoolean(true),
  body('display_flags.order.price_display').exists().isIn(['FROM_X', 'VARIES', 'ALWAYS', 'MIN_TO_MAX', 'LIST']),
  body('display_flags.order.adornment').trim(),
  body('display_flags.order.suppress_exhaustive_modifier_list').toBoolean(true),
  body('display_flags.menu.hide').toBoolean(true),
  body('ordinal').exists().isInt({min: 0}),
  body('price.amount').isInt({ min: 0 }).exists(),
  body('price.currency').exists().isLength({ min: 3, max: 3 }).isIn(['USD']),
  body('modifiers.*.modifier_type_id').trim().escape().exists().isMongoId(),
  body('modifiers.*.options.*.option_id').trim().escape().exists().isMongoId(),
  body('modifiers.*.options.*.placement').exists().isIn(['NONE', 'LEFT', 'RIGHT', 'WHOLE']),
  body('modifiers.*.options.*.qualifier').exists().isIn(['REGULAR', 'LITE', 'HEAVY', 'OTS'])
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/product/:pid/', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.CreateProductInstance(req.params.pid, {
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
        req.logger.info(`Unable to find parent product id: ${req.params.pid} to create new product instance`);
        return res.status(404).send(`Unable to find parent product id: ${req.params.pid} to create new product instance`);
      }
      const location = `${req.base}${req.originalUrl}/${doc._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      next(error)
    }
  })