// edits an option in the catalog
// TODO: double check that fields not passed aren't removed. make it so fields that aren't present in the 
const Router = require('express').Router
const { body, param, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');

const ValidationChain = [  
  // kinda wonky since you could potentially re-assign the option type here, but it's in the path
  param('otid').trim().escape().exists(), 
  param('oid').trim().escape().exists(),
  body('display_name').trim().escape(),
  body('description').trim().escape(),
  body('shortcode').trim().escape(),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
  // don't sanitize this to boolean, but validate that it is a boolean
  body('disabled').isBoolean(true),
  // don't sanitize this to boolean, but validate that it is a boolean
  body('permanent_disable').isBoolean(true),
  body('price.amount').isInt({min: 0, max:100000}),
  body('price.currency').isLength({min:3, max: 3}).isIn(['USD']),
  body('ordinal').isInt({min: 0, max:64}),
  body('enable_function_name').trim().escape().isAscii(),
  body('flavor_factor').isFloat({ min: 0, max: 5 }),
  body('bake_factor').isFloat({ min: 0, max: 5 }),
  // don't sanitize this to boolean, but validate that it is a boolean
  body('can_split').isBoolean(true), 
];

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/option/:otid/:oid', ValidationChain, CheckJWT, async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      req.db.WOptionSchema.findByIdAndUpdate(
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
            flavor_factor: req.body.flavor_factor,
            bake_factor: req.body.bake_factor,
            can_split: req.body.can_split,
          },
          enable_function_name: req.body.enable_function_name,
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