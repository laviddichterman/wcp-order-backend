// deletes specified category
// TODO: need to null out any references to this category in children
// TODO: figure out if you can delete a category with any children (either products or other categories)

const Router = require('express').Router
const { param, validationResult } = require('express-validator');

const ValidationChain = [  
  param('catid').trim().escape().exists()
];


module.exports = Router({ mergeParams: true })
  .delete('/v1/menu/category/:catid', ValidationChain, (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }

      req.db.WCategorySchema.findByIdAndDelete(req.params.catid, (err, data) => {
        if (err) { 
          req.logger.error(`Unable to delete category: ${req.params.catid}`);
          res.status(500).send(`Unable to delete category: ${req.params.catid}`);
          throw err;
        }
        else {
          if (!data) {
            req.logger.info(`Unable to delete category: ${req.params.catid}`);
            res.status(404).send(`Unable to delete category: ${req.params.catid}`);
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