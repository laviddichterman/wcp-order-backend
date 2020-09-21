// creates a new option in the catalog
const Router = require('express').Router
const { body, param, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  param('mtid').trim().escape().exists().isMongoId(),
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
  body('price.amount').isInt({min: 0, max:100000}).exists(),
  body('price.currency').exists().isLength({min:3, max: 3}).isIn(['USD']),
  body('ordinal').isInt({min: 0, max:64}).exists(),
  body('enable_function').optional({nullable: true}).isMongoId(),
  body('flavor_factor').isFloat({ min: 0, max: 5 }),
  body('bake_factor').isFloat({ min: 0, max: 5 }),
  body('can_split').toBoolean(true),
  body('display_flags.omit_from_shortname').toBoolean(true),
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/option/:mtid/', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const new_option = await req.catalog.CreateOption({
        price: req.body.price,
        description: req.body.description,
        display_name: req.body.display_name,
        shortcode: req.body.shortcode,
        disabled: req.body.disabled ? req.body.disabled : null, 
        revelID: req.body.revelID,
        squareID: req.body.squareID,
        option_type_id: req.params.mtid,
        ordinal: req.body.ordinal,
        flavor_factor: req.body.flavor_factor || 0,
        bake_factor: req.body.bake_factor || 0,
        can_split: req.body.can_split || false,
        enable_function: req.body.enable_function || "",
        display_flags: req.body.display_flags,
      });
      if (!new_option) {
        req.logger.info(`Unable to find ModifierType ${req.params.mtid} to create Modifier Option`);
        return res.status(404).send(`Unable to find ModifierType ${req.params.mtid} to create Modifier Option`);
      }
      const location = `${req.base}${req.originalUrl}/${new_option._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(new_option);
    } catch (error) {
      next(error)
    }
  })