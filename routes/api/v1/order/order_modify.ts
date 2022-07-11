// modify an order
import { Router } from 'express';

module.exports = Router({ mergeParams: true })
  .patch('/v1/order/{id}', async (req, res, next) => {
    try {
      
    } catch (error) {
      next(error)
    }
  })