const express = require('express');
const http = require("http");
const socketIo = require("socket.io");
const bodyParser = require('body-parser');
const cors = require('cors');
const logger = require("./logging");
const app = express();

const server = http.createServer(app);
const io = socketIo(server);
const PORT = 4001;
const { CheckJWT, JWTKeyStore } = require('./config/authorization');
const socketioJwt = require('./forked-socketiojwt');
const jwtAuthz = require('express-jwt-authz');

const DataProvider = require("./config/database");

app.use(cors());
app.use(bodyParser.json());

const SOCKETIO_JWT_AUTHORIZATION_CALLBACK = socketioJwt.authorize({
  secret: JWTKeyStore,
  timeout: 15000
});
const socket_auth = io.of("/nsAuth");
const socket_ro = io.of("/nsRO");

// handle authenticated socketIO
socket_auth.on('connect', SOCKETIO_JWT_AUTHORIZATION_CALLBACK)
  .on('authenticated', (socket) => {
    logger.debug("New client authenticated. %o", socket.decoded_token);
    socket.on('AUTH_SERVICES', function (msg) {
      logger.error("SOMEHOW Got socket message on AUTH_SERVICES channel: %o", msg);
      //socket_ro.emit('WCP_SERVICES', DataProvider.Services);
    });
    socket.on('AUTH_BLOCKED_OFF', function (msg) {
      logger.debug("Got socket message on AUTH_BLOCKED_OFF channel: %o", msg);
      DataProvider.BlockedOff = msg;
      socket_ro.emit('WCP_BLOCKED_OFF', DataProvider.BlockedOff);
    });
    socket.on('AUTH_LEAD_TIMES', function (msg) {
      logger.debug("Got socket message on AUTH_LEAD_TIMES channel: %o", msg);
      DataProvider.LeadTimes = msg;
      socket_ro.emit('WCP_LEAD_TIMES', DataProvider.LeadTimes);
    });
    socket.on('AUTH_SETTINGS', function (msg) {
      logger.debug("Got socket message on AUTH_SETTINGS channel: %o", msg);
      DataProvider.Settings = msg;
      socket_ro.emit('WCP_SETTINGS', DataProvider.Settings);
    });
  });

socket_ro.on('connect',(socket) => { 
  socket.emit('WCP_SERVICES', DataProvider.Services);
  socket.emit('WCP_LEAD_TIMES', DataProvider.LeadTimes);
  socket.emit('WCP_BLOCKED_OFF', DataProvider.BlockedOff);
  socket.emit('WCP_SETTINGS', DataProvider.Settings);
});

server.listen(PORT, function () {
  logger.info("Server is running on Port: " + PORT);
});

module.exports = server;