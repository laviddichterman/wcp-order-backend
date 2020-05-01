// deletes specified product
// TODO: how do we handle when we have old orders with this product?
// maybe just disable?

const Router = require('express').Router
const { param, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  param('pid').trim().escape().exists()
];

module.exports = Router({ mergeParams: true })
  .delete('/v1/menu/product/:pid', ValidationChain, CheckJWT, (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }

      req.db.WOptionSchema.WProductSchema(req.params.pid, (err, data) => {
        if (err) { 
          req.logger.error(`Unable to delete product: ${req.params.pid}`);
          res.status(500).send(`Unable to delete product: ${req.params.pid}`);
          throw err;
        }
        else {
          if (!data) {
            req.logger.info(`Unable to delete product: ${req.params.pid}`);
            res.status(404).send(`Unable to delete product: ${req.params.pid}`);
          }
          else {
            req.logger.info(`Deleted ${data}`);
            res.status(200).send(`Deleted ${data}`);  
          }
        }
      });
    } catch (error) {
      next(error)
    }
  })