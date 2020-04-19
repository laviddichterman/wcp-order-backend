// creates a new option in the catalog
const Router = require('express').Router
const { body, param, validationResult } = require('express-validator');

const ValidationChain = [  
  // kinda wonky since you could potentially re-assign the option type here, but it's in the path
  param('otid').trim().escape().exists(), 
  param('oid').trim().escape().exists(),
  body('display_name').trim().escape().exists(),
  body('description').trim().escape(),
  body('shortcode').trim().escape().exists(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  body('disabled').toBoolean(true),
  body('permanent_disable').toBoolean(true),
  body('price.amount').isInt({min: 0, max:100000}).exists(),
  body('price.currency').exists().isLength({min:3, max: 3}).isIn(['USD']),
  body('ordinal').isInt({min: 0, max:64}).exists(),
  body('enable_function_name').trim().escape().isAscii(),
  body('flavor_factor').isFloat({ min: 0, max: 5 }),
  body('bake_factor').isFloat({ min: 0, max: 5 }),
  body('can_split').toBoolean(true),
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/option/:otid/:oid', ValidationChain, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      req.db.WOptionTypeSchema.findByIdAndUpdate(
        req.params.oid,
        {
          catalog_item: {
            price: {
              amount: req.body.price.amount,
              currency: req.body.price.currency,
            },
            description: req.body.description,
            display_name: req.body.display_name,
            shortcode: req.body.shortcode,
            disabled: req.body.disabled,
            permanent_disable: req.body.permanent_disable,
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
        },
        { new: true },
        (err, doc) => {
          if (err) {
            req.logger.info(`Unable to update option type: ${req.params.otid}`);
            return res.status(404).send(`Unable to update option type: ${req.params.otid}`);;
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