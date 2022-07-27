import { NextFunction, Request } from 'express';
import { getSharedIdempotencyService } from 'express-idempotency';


function idempotencyMiddleware(request: Request, response: Response, next: NextFunction) {
  const idempotencyService = getSharedIdempotencyService();
  if (idempotencyService.isHit(request)) {
    idempotencyService.reportError(request);
    return;
  }
  next();
}

export default idempotencyMiddleware;