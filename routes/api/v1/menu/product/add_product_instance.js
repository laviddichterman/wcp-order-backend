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
  //body('permanent_disable').toBoolean(true),
  body('is_base').toBoolean(true),
  body('display_flags.skip_customization').toBoolean(true),
  body('display_flags.hide_from_menu').toBoolean(true),
  body('display_flags.price_display').exists().isIn(['IF_COMPLETE', 'FROM_X', 'NEVER', 'ALWAYS']),
  body('display_flags.menu_adornment').trim(),
  body('ordinal').exists().isInt({min: 0}),
  body('price.amount').isInt({ min: 0 }).exists(),
  body('price.currency').exists().isLength({ min: 3, max: 3 }).isIn(['USD']),
  body('modifiers.*.modifier_type_id').trim().escape().exists(),
  body('modifiers.*.options.*.option_id').trim().escape().exists(),
  body('modifiers.*.options.*.placement').exists().isIn(['NONE', 'LEFT', 'RIGHT', 'WHOLE'])
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