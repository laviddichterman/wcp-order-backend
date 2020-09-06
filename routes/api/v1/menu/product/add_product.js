// creates a new option in the catalog
const Router = require('express').Router
const { body, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [
  body('display_name').trim().exists(),
  body('description').trim(),
  body('shortcode').trim().escape().exists(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('disabled').custom((value) => {
    if (value === null || (typeof value === 'object' && "start" in value && "end" in value && Number.isInteger(value.start) && Number.isInteger(value.end))) {
      return true;
    }
    throw new Error("Disabled value misformed");
  }),
  //body('permanent_disable').toBoolean(true),
  body('display_flags.flavor_max').isFloat({min: 0}),
  body('display_flags.bake_max').isFloat({min: 0}),
  body('display_flags.bake_differential').isFloat({min: 0}),
  // TODO: ensure show_name_of_base_product is TRUE if modifier list length === 0
  body('display_flags.show_name_of_base_product').toBoolean(true),
  body('display_flags.singular_noun').trim(),
  body('ordinal').exists().isInt({min: 0}),
  body('price.amount').isInt({ min: 0 }).exists(),
  body('price.currency').exists().isLength({ min: 3, max: 3 }).isIn(['USD']),
  body('modifiers.*').trim().escape().exists().isMongoId(),
  body('category_ids.*').trim().escape().exists().isMongoId(),
  body('create_product_instance').toBoolean(true)
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/product', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const newproduct = await req.catalog.CreateProduct({
        price: req.body.price,
        description: req.body.description,
        display_name: req.body.display_name,
        shortcode: req.body.shortcode,
        disabled: req.body.disabled,
        permanent_disable: false,
        ordinal: req.body.ordinal,
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        modifiers: req.body.modifiers,
        category_ids: req.body.category_ids,
        display_flags: req.body.display_flags,
      });
      if (!newproduct) {
        req.logger.info(`Unable to find Modifiers or Categories to create Product`);
        return res.status(404).send("Unable to find Modifiers or Categories to create Product");
      }
      if (req.body.create_product_instance) {
        const pi = await req.catalog.CreateProductInstance(newproduct._id, {
          price: req.body.price,
          description: req.body.description,
          display_name: req.body.display_name,
          shortcode: req.body.shortcode,
          disabled: req.body.disabled,
          ordinal: req.body.ordinal,
          externalIDs: {
            revelID: req.body.revelID,
            squareID: req.body.squareID
          },
          display_flags: {},
          is_base: true
        });
        if (!pi) {
          req.logger.info(`Error while creating product instance for  ${newproduct._id}.`);
          return res.status(500).send(`Error while creating product instance for  ${newproduct._id}.`);
        }
        const location = `${req.base}${req.originalUrl}/${newproduct._id}/${pi._id}`;
        res.setHeader('Location', location);
        return res.status(201).send({ product_instance: pi, product: newproduct });
      }
      const location = `${req.base}${req.originalUrl}/${newproduct._id}`;
      res.setHeader('Location', location);
      return res.status(201).send(newproduct);
    } catch (error) {
      next(error)
    }
  })