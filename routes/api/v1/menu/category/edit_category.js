// edits a category

const Router = require('express').Router
const { param, body, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [
  param('catid').trim().escape().exists(),
  body('name').trim().escape().exists(),
  body('description').trim().escape(),
  body('parent_id').trim().escape()
];

module.exports = Router({ mergeParams: true })
  .patch('/v1/menu/category/:catid', ValidationChain, CheckJWT, (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      req.db.WCategorySchema.findByIdAndUpdate(
        req.params.catid,
        {
          name: req.body.name,
          description: req.body.description,
          parent_id: req.body.parent_id
        },
        { new: true },
        (err, doc) => {
          if (err) {
            req.logger.info(`Unable to update category: ${req.params.catid}`);
            return res.status(404).send(`Unable to update category: ${req.params.catid}`);;
          }
          else {
            req.logger.info(`Successfully updated ${doc}`);
            return res.status(200).send(doc);
          }
        });
    } catch (error) {
      next(error)
    }
  })