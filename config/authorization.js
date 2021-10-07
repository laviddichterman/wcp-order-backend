const jwt = require('express-jwt');
const jwks = require('jwks-rsa');
const socketioJwt = require('socketio-jwt');
const jwtAuthz = require('express-jwt-authz');

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

const SocketIoJwtAuthenticateAndAuthorize = (permissions) => {
  return (socket) => {
    const SocketIoJwtAuthenticate = socketioJwt.authorize({
      secret: JWTKeyStore,
      timeout: 15000,
      additional_auth: (decoded, onSuccess, onError) => {
        var success = true;
        if (permissions.length) {
          if (decoded.permissions && decoded.permissions.length) {
            for (var i in permissions) { 
              success = success && decoded.permissions.includes(permissions[i]);
            }
          }
          else {
            success = false;
          }
        }
        success ? onSuccess() : onError();
      }
    })(socket);
    
  }
}

const CheckJWT = jwt({
  secret: JWTKeyStore,
  audience: authConfig.audience,
  issuer: `https://${authConfig.domain}/`,
  algorithms: ['RS256']
});

exports.CheckJWT = CheckJWT;
exports.SocketIoJwtAuthenticateAndAuthorize = SocketIoJwtAuthenticateAndAuthorize;