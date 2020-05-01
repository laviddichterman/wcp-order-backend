// creates a new option in the catalog
const Router = require('express').Router
const { body, param, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  param('otid').trim().escape().exists(),
  body('display_name').trim().escape().exists(),
  body('description').trim().escape(),
  body('shortcode').trim().escape().exists(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('disabled').toBoolean(true),
  //body('permanent_disable').toBoolean(true),
  body('price.amount').isInt({min: 0, max:100000}).exists(),
  body('price.currency').exists().isLength({min:3, max: 3}).isIn(['USD']),
  body('ordinal').isInt({min: 0, max:64}).exists(),
  body('enable_function_name').trim().escape().isAscii(),
  body('flavor_factor').isFloat({ min: 0, max: 5 }),
  body('bake_factor').isFloat({ min: 0, max: 5 }),
  body('can_split').toBoolean(true),
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/option/:otid/', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      req.db.WOptionTypeSchema.findById(
        req.params.otid,
        (err, doc) => {
          if (err) {
            req.logger.info(`Unable to find option type to add option to: ${req.params.otid}`);
            return res.status(404).send(`Unable to find option type to add option to: ${req.params.otid}`);;
          }
          else {
            const newoption = new req.db.WOptionSchema({
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
                  sqID: req.body.squareID
                }
              },
              option_type_id: req.params.otid,
              ordinal: req.body.ordinal,
              metadata: {
                flavor_factor: req.body.flavor_factor || 0,
                bake_factor: req.body.bake_factor || 0,
                can_split: req.body.can_split || false,
              },
              enable_function_name: req.body.enable_function_name || "",
            });
            newoption.save((err, doc) => {
              if (err) {
                req.logger.error(`Unable to add option: ${JSON.stringify(req.body)}`);
                return res.status(500).send(`Unable to add option: ${JSON.stringify(req.body)}`);
              }
              res.setHeader('Location', `${req.base}${req.originalUrl}/${doc.id}`);
              return res.status(201).send(doc);
            });         
          }
        });
    } catch (error) {
      next(error)
    }
  })