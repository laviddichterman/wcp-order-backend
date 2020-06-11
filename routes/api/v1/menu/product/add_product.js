// creates a new option in the catalog
const Router = require('express').Router
const { body, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [
  body('display_name').trim().escape().exists(),
  body('description').trim().escape(),
  body('shortcode').trim().escape().exists(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('disabled').toBoolean(true),
  //body('permanent_disable').toBoolean(true),
  body('price.amount').isInt({ min: 0, max: 100000 }).exists(),
  body('price.currency').exists().isLength({ min: 3, max: 3 }).isIn(['USD']),
  body('modifiers.*').trim().escape().exists(),
  body('category_ids.*').trim().escape().exists()
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/product', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      const newproduct = new req.db.WProductSchema({
        catalog_item: {
          price: {
            amount: req.body.price.amount,
            currency: req.body.price.currency,
          },
          description: req.body.description,
          display_name: req.body.display_name,
          shortcode: req.body.shortcode,
          disabled: req.body.disabled,
          permanent_disable: false,
          externalIDs: {
            revelID: req.body.revelID,
            squareID: req.body.squareID
          }
        },
        modifiers: req.body.modifiers,
        category_ids: req.body.category_ids,
      });
      newproduct.save((err, doc) => {
        if (err) {
          req.logger.error(`Unable to add product: ${JSON.stringify(req.body)}`);
          return res.status(500).send(`Unable to add product: ${JSON.stringify(req.body)}`);
        }
        res.setHeader('Location', `${req.base}${req.originalUrl}/${doc.id}`);
        return res.status(201).send(doc);
      });
    } catch (error) {
      next(error)
    }
  })