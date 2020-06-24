// edits a product in the catalog
// TODO: double check that fields not passed aren't removed. 
// make it so fields that aren't present in the body are handled properly
const Router = require('express').Router
const { body, param, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  param('pid').trim().escape().exists(), 
  body('display_name').trim(),
  body('description').trim(),
  body('shortcode').trim().escape(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  // don't sanitize this to boolean, but validate that it is a boolean
  body('disabled').isBoolean(true),
  // don't sanitize this to boolean, but validate that it is a boolean
  //body('permanent_disable').isBoolean(true),
  body('price.amount').isInt({min: 0, max:100000}),
  body('price.currency').isLength({min:3, max: 3}).isIn(['USD']),
  body('modifiers.*').trim().escape().exists(),
  body('category_ids.*').trim().escape().exists()
];

module.exports = Router({ mergeParams: true })
  .patch('/v1/menu/product/:pid', ValidationChain, CheckJWT, async (req, res, next) => {
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
        disabled: req.body.disabled,
        permanent_disable: false,
        externalIDs: {
          revelID: req.body.revelID,
          squareID: req.body.squareID
        },
        modifiers: req.body.modifiers,
        category_ids: req.body.category_ids,
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