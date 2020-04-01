// submit an order
const Router = require('express').Router

module.exports = Router({ mergeParams: true })
  .post('/v1/order', async (req, res, next) => {
    try {
    } catch (error) {
      next(error)
    }
  })