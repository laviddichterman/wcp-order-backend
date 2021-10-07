const Router = require('express').Router
const { CheckJWT } = require('../../../../config/authorization');

module.exports = Router({ mergeParams: true })
  .get('/v1/config/kvstore', [], CheckJWT, async (req, res, next) => {
    try {
      res.status(200).send(req.db.KeyValueConfig);
    } catch (error) {
      next(error)
    }
  })