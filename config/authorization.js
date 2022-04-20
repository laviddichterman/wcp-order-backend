const { auth, requiredScopes } = require('express-oauth2-jwt-bearer');

const authConfig = {
  domain: "lavid.auth0.com",
  audience: process.env.AUTH_AUDIENCE || "https://wario.windycitypie.com"
};

const CheckJWT = auth({
  audience: authConfig.audience,
  issuerBaseURL: `https://${authConfig.domain}/`,
});

exports.CheckJWT = CheckJWT;

// TODO: move to wcp-shared-internal or something like that
/**
 * Allows writing to the timing-related order settings
 */
exports.ScopeWriteOrderConfig = requiredScopes("write:order_config");
/**
 * Allows reading the main service settings key-value store.
 */
exports.ScopeReadKVStore = requiredScopes("read:settings");
/**
 * Allows writing the main service settings key-value store.
 */
exports.ScopeWriteKVStore = requiredScopes("write:settings");
/**
 * Allows writing the product catalog and related information.
 * Does not allow deleting data.
 */
exports.ScopeWriteCatalog = requiredScopes("write:catalog");
/**
 * Allows writing the product catalog and related information but with the
 * advanced features editable as well.
 * Does not allow deleting data.
 */
 exports.ScopeAdvancedCatalog = requiredScopes("advanced:catalog");
/**
 * Allows deleting the product catalog and related information.
 * It is assumed that being granted this scope includes ScopeWriteCatalog
 */
 exports.ScopeDeleteCatalog = requiredScopes("delete:catalog");
/**
 * Allows editing (issuing and refunding) store credit
 */
 exports.ScopeEditCredit = requiredScopes("edit:store_credit");
 /**
 * Allows advanced editing store credit
 */
  exports.ScopeAdvancedCredit = requiredScopes("advanced:store_credit");
