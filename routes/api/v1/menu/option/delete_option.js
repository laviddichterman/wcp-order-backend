// deletes specified option
// TODO: need to null out any references to this option in products
// TODO: figure out if you can delete an option type with any children
// maybe just disable?

const Router = require('express').Router
const { param, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  param('otid').trim().escape().exists().isMongoId(),
  param('oid').trim().escape().exists().isMongoId()
];

module.exports = Router({ mergeParams: true })
  .delete('/v1/menu/option/:otid/:oid', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.DeleteModifierOption(req.params.oid);
      if (!doc) {
        req.logger.info(`Unable to delete Modifier Option: ${req.params.oid}`);
        return res.status(404).send(`Unable to delete Modifier Option: ${req.params.oid}`);
      }
      req.logger.info(`Successfully deleted ${doc}`);
      return res.status(200).send(doc);
    } catch (error) {
      next(error)
    }
  })