import { NextFunction, Request } from 'express';
import logger from '../logging';


function loggerMiddleware(request: Request, response: Response, next: NextFunction) {
  logger.debug(`${request.method} ${request.path}`);
  next();
}

export default loggerMiddleware;