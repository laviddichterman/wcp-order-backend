import { auth, requiredScopes } from 'express-oauth2-jwt-bearer';
import logger from '../logging';

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

exports.CheckJWT = CheckJWT;

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
