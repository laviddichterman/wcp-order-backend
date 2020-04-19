// deletes specified option
// TODO: need to null out any references to this option in products
// TODO: figure out if you can delete an option type with any children
// maybe just disable?

const Router = require('express').Router
const { param, validationResult } = require('express-validator');

const ValidationChain = [  
  param('otid').trim().escape().exists(),
  param('oid').trim().escape().exists()
];

module.exports = Router({ mergeParams: true })
  .delete('/v1/menu/option/:otid/:oid', ValidationChain, (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }

      req.db.WOptionSchema.findByIdAndDelete(req.params.oid, (err, data) => {
        if (err) { 
          req.logger.error(`Unable to delete option: ${req.params.oid}`);
          res.status(500).send(`Unable to delete option: ${req.params.oid}`);
          throw err;
        }
        else {
          if (!data) {
            req.logger.info(`Unable to delete option: ${req.params.oid}`);
            res.status(404).send(`Unable to delete option: ${req.params.oid}`);
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