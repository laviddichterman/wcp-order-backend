import { auth, requiredScopes } from 'express-oauth2-jwt-bearer';
import logger from '../logging';
import type { AuthorizeOptions } from '@thream/socketio-jwt';
import {JwksClient } from 'jwks-rsa'
import jwt from 'jsonwebtoken';



if (!process.env.AUTH_DOMAIN) {
  logger.error("Missing config for AUTH_DOMAIN ");
  process.exit(1);
}
if (!process.env.AUTH_AUDIENCE) {
  logger.error("Missing config for AUTH_AUDIENCE");
  process.exit(1);
}

const authConfig = {
  domain: process.env.AUTH_DOMAIN,
  audience: process.env.AUTH_AUDIENCE
};
export const CheckJWT = auth({
  audience: authConfig.audience,
  issuerBaseURL: `https://${authConfig.domain}/`,
});

const JWTKeyStore = new JwksClient({
  jwksUri: `https://${authConfig.domain}/.well-known/jwks.json`
});

class UnauthorizedError extends Error {
  inner: {
    message: string;
  };
  data: {
    message: string;
    code: string;
    type: 'UnauthorizedError';
  };
  constructor(code: string, error: {
    message: string;
  }) {
    super(error.message);
    this.name = 'UnauthorizedError';
    this.inner = error;
    this.data = {
      message: this.message,
      code,
      type: 'UnauthorizedError'
    };
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}
export const isUnauthorizedError = (error: any): boolean => {
  return error.data.type === 'UnauthorizedError';
};


const authorizeMethod = (options: AuthorizeOptions) => {
  const { secret, algorithms = [
    'HS256'
  ], onAuthentication } = options;
  return async (socket: any, next: any) => {
    let encodedToken = null;
    const { token } = socket.handshake.auth;
    if (token != null) {
      const tokenSplitted = token.split(' ');
      if (tokenSplitted.length !== 2 || tokenSplitted[0] !== 'Bearer') {
        return next(new UnauthorizedError('credentials_bad_format', {
          message: 'Format is Authorization: Bearer [token]'
        }));
      }
      encodedToken = tokenSplitted[1];
    }
    if (encodedToken == null) {
      return next(new UnauthorizedError('credentials_required', {
        message: 'no token provided'
      }));
    }
    socket.encodedToken = encodedToken;
    let keySecret = null;
    let decodedToken;
    if (typeof secret === 'string') {
      keySecret = secret;
    } else {
      const completeDecodedToken = jwt.decode(encodedToken, {
        complete: true
      });
      // @ts-ignore
      keySecret = await secret(completeDecodedToken);
    }
    try {
      decodedToken = jwt.verify(encodedToken, keySecret, {
        algorithms
      });
    } catch {
      return next(new UnauthorizedError('invalid_token', {
        message: 'Unauthorized: Token is missing or invalid Bearer'
      }));
    }
    socket.decodedToken = decodedToken;
    if (onAuthentication != null) {
      try {
        socket.user = await onAuthentication(decodedToken);
      } catch (error) {
        return next(error);
      }
    }
    return next();
  };
};

export const SocketIoJwtAuthenticateAndAuthorize = (permissions: string[]) => authorizeMethod({
  secret: async (decodedToken) => {
    const key = await JWTKeyStore.getSigningKey(decodedToken.header.kid);
    logger.info(`got ${key}`);
    return key.getPublicKey();
  },
  onAuthentication: (decoded) => {
    const success = permissions.reduce((acc, perm) => acc && decoded.permissions && decoded.permissions.length && decoded.permissions.includes(perm), true);
    if (!success) {
      throw 'Unauthorized';
    }
    return decoded;
  }
});


// TODO: move to wcp-shared-internal or something like that
/**
 * Allows writing to the timing-related order settings
 */
export const ScopeWriteOrderConfig = requiredScopes("write:order_config");
/**
 * Allows reading the main service settings key-value store.
 */
export const ScopeReadKVStore = requiredScopes("read:settings");
/**
 * Allows writing the main service settings key-value store.
 */
export const ScopeWriteKVStore = requiredScopes("write:settings");
/**
 * Allows writing the product catalog and related information.
 * Does not allow deleting data.
 */
export const ScopeWriteCatalog = requiredScopes("write:catalog");
/**
 * Allows writing the product catalog and related information but with the
 * advanced features editable as well.
 * Does not allow deleting data.
 */
export const ScopeAdvancedCatalog = requiredScopes("advanced:catalog");
/**
 * Allows deleting the product catalog and related information.
 * It is assumed that being granted this scope includes ScopeWriteCatalog
 */
export const ScopeDeleteCatalog = requiredScopes("delete:catalog");
/**
 * Allows editing (issuing and refunding) store credit
 */
export const ScopeEditCredit = requiredScopes("edit:store_credit");
/**
* Allows advanced editing store credit
*/
export const ScopeAdvancedCredit = requiredScopes("advanced:store_credit");
/**
* Allows reading accounting information
*/
export const ScopeAccountingRead = requiredScopes("read:accounting");
/**
* Allows writing accounting information
*/
export const ScopeAccountingWrite = requiredScopes("write:accounting");
/**
 * Allows writing to the timing-related order settings
 */
export const ScopeReadOrders = requiredScopes("read:order");
/**
 * Allows writing to the timing-related order settings
 */
export const ScopeWriteOrders = requiredScopes("write:order");
