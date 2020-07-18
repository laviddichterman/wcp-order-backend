// edits a product in the catalog
// TODO: double check that fields not passed aren't removed. 
// make it so fields that aren't present in the body are handled properly
const Router = require('express').Router
const { body, param, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  param('pid').trim().escape().exists(), 
  body('name').trim(),
  body('ordinal').exists().isInt({min: 0}),
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
        name: req.body.name,
        ordinal: req.body.ordinal,
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