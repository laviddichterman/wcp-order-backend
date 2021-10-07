const jwt = require('express-jwt');
const jwks = require('jwks-rsa');

const authConfig = {
  domain: "lavid.auth0.com",
  audience: process.env.AUTH_AUDIENCE || "https://wario.windycitypie.com"
};

const JWTKeyStore = jwks.expressJwtSecret({
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
  jwksUri: `https://${authConfig.domain}/.well-known/jwks.json`
});

const CheckJWT = jwt({
  secret: JWTKeyStore,
  audience: authConfig.audience,
  issuer: `https://${authConfig.domain}/`,
  algorithms: ['RS256']
});

exports.CheckJWT = CheckJWT;
