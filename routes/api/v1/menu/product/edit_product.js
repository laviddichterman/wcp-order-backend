// edits a product in the catalog
// TODO: double check that fields not passed aren't removed. 
// make it so fields that aren't present in the body are handled properly
const Router = require('express').Router
const { body, param, validationResult } = require('express-validator');
const { CheckJWT, ScopeWriteCatalog } = require('../../../../../config/authorization');

const ValidationChain = [  
  param('pid').trim().escape().exists().isMongoId(), 
  body('display_name').trim(),
  body('description').trim(),
  body('shortcode').trim().escape(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  // don't sanitize this to boolean, but validate that it is a boolean
  //body('permanent_disable').isBoolean(true),
  body('display_flags.flavor_max').isFloat({min: 0}),
  body('display_flags.bake_max').isFloat({min: 0}),
  body('display_flags.bake_differential').isFloat({min: 0}),
  body('display_flags.show_name_of_base_product').toBoolean(true),
  body('display_flags.singular_noun').trim(),
  body('price.amount').isInt({min: 0, max:100000}),
  body('price.currency').isLength({min:3, max: 3}).isIn(['USD']),
  body('modifiers.*.mtid').trim().escape().exists().isMongoId(),
  body('modifiers.*.enable').optional({nullable: true}).isMongoId(),
  body('category_ids.*').trim().escape().exists()
];

module.exports = Router({ mergeParams: true })
  .patch('/v1/menu/product/:pid', CheckJWT, ScopeWriteCatalog, ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.UpdateProduct(req.params.pid, {
        price: req.body.price,
        description: req.body.description,
        display_name: req.body.display_name,
        shortcode: req.body.shortcode,
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        modifiers: req.body.modifiers,
        category_ids: req.body.category_ids,
        display_flags: req.body.display_flags,
      });
      if (!doc) {
        req.logger.info(`Unable to update Product: ${req.params.pid}`);
        return res.status(404).send(`Unable to update Product: ${req.params.pid}`);
      }
      req.logger.info(`Successfully updated ${JSON.stringify(doc)}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })