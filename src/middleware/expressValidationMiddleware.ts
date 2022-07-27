import { ValidationChain, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import HttpException from '../types/HttpException';

const expressValidationMiddleware = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    next(new HttpException(400, errors.array()))
  };
};

export default expressValidationMiddleware;