// creates a new category in the catalog, parent id and description optional
const Router = require('express').Router
const { body, validationResult } = require('express-validator');

/*  // brief name of the category
  name: String,

  // longer, optional description of the category
  description: String,

  // parent category ID if any
  parent_id: String
*/

const ValidationChain = [  
  body('name').trim().escape().exists(),
  body('description').trim().escape(),
  body('parent_id').trim().escape()
];


module.exports = Router({ mergeParams: true })
  .post('/v1/menu/category', ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }

      const newcategory = new req.db.WCategorySchema({
        description: req.body.description,
        name: req.body.name,
        parent_id: req.body.parent_id
      });
      await newcategory.save();
      const location = `${req.base}${req.originalUrl}/${newcategory.id}`;
      res.setHeader('Location', location);
      res.status(201).send(newcategory);
    } catch (error) {
      next(error)
    }
  })