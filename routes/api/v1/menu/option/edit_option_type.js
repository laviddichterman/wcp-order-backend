// assigns listed sensors to a location
// also can be used to update name or description

const Router = require('express').Router
const { param, body, validationResult } = require('express-validator');
const { CheckJWT } = require('../../../../../config/authorization');


const ValidationChain = [
  param('otid').trim().escape().exists(),
  body('name').trim().escape(),
  body('ordinal').isInt({min: 0, max:64}),
  body('selection_type').isIn(['SINGLE', 'MANY']),
  body('revelID').trim().escape(),
  body('squareID').trim().escape(),
];

module.exports = Router({ mergeParams: true })
  .patch('/v1/menu/option/:otid', ValidationChain, CheckJWT, (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() });
      }
      req.db.WOptionTypeSchema.findByIdAndUpdate(
        req.params.otid,
        {
          name: req.body.name,
          ordinal: req.body.ordinal,
          selection_type: req.body.selection_type,
          externalIDs: {
            revelID: req.body.revelID,
            sqID: req.body.squareID
          }
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