// deletes specified category
// TODO: need to null out any references to this category in children
// TODO: figure out if you can delete a category with any children (either products or other categories)

const Router = require('express').Router
const { param, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  param('catid').trim().escape().exists()
];


module.exports = Router({ mergeParams: true })
  .delete('/v1/menu/category/:catid', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const doc = await req.catalog.DeleteCategory(req.params.catid);
      if (!doc) {
        req.logger.info(`Unable to delete category: ${req.params.catid}`);
        return res.status(404).send(`Unable to delete category: ${req.params.catid}`);
      }
    } catch (error) {
      next(error)
    }
  })