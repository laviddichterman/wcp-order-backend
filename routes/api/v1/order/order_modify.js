// modify an order
const Router = require('express').Router

module.exports = Router({ mergeParams: true })
  .patch('/v1/order/{id}', async (req, res, next) => {
    try {
      
    } catch (error) {
      next(error)
    }
  })