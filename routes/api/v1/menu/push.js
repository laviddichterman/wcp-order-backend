// creates a new option type in the catalog
const Router = require('express').Router
const { CheckJWT } = require('../../../../config/authorization');

module.exports = Router({ mergeParams: true })
  .post('/v1/menu/', CheckJWT, async (req, res, next) => {
    try {
      const doc = await req.catalog.CreateModifierType({
        name: req.body.name,
        ordinal: req.body.ordinal,
        min_selected: req.body.min_selected,
        max_selected: req.body.max_selected,
        revelID: req.body.revelID,
        squareID: req.body.squareID
      });
      const location = `${req.base}${req.originalUrl}/${doc.id}`;
      res.setHeader('Location', location);
      return res.status(201).send(doc);
    } catch (error) {
      next(error)
    }
  })