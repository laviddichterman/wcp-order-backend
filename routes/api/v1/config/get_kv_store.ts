import { NextFunction, Request, Response, Router } from 'express';
import { CheckJWT, ScopeReadKVStore } from '../../../../config/authorization';

module.exports = Router({ mergeParams: true })
  .get('/v1/config/kvstore', CheckJWT, ScopeReadKVStore, async (req : Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).send(req.db.KeyValueConfig);
    } catch (error) {
      next(error)
    }
  })