// modify an order
import { Router, Request, Response, NextFunction } from 'express';

module.exports = Router({ mergeParams: true })
  .patch('/v1/order/{id}', async (req : Request, res: Response, next: NextFunction) => {
    try {
      
    } catch (error) {
      next(error)
    }
  })