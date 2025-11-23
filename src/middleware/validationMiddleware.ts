import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { RequestHandler } from 'express';
import HttpException from '../types/HttpException';

type ValidateSource = 'body' | 'query' | 'params';

interface ValidationOptions {
  skipMissingProperties?: boolean;
  source?: ValidateSource;
}

function validationMiddleware<T>(
  type: any, 
  options: ValidationOptions = {}
): RequestHandler {
  const { skipMissingProperties = false, source = 'body' } = options;
  
  return (req, res, next) => {
    const dataToValidate = source === 'body' ? req.body : 
                          source === 'query' ? req.query : 
                          req.params;
    
    validate(plainToInstance(type, dataToValidate), { skipMissingProperties })
      .then((errors: ValidationError[]) => {
        if (errors.length > 0) {
          const message = errors.map((error: ValidationError) => 
            Object.values(error.constraints!)).join(', ');
          next(new HttpException(400, message));
        } else {
          next();
        }
      });
  };
}

export default validationMiddleware;