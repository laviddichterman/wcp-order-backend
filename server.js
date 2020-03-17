const express = require('express');
const http = require("http");
const socketIo = require("socket.io");
const bodyParser = require('body-parser');
const cors = require('cors');
const logger = require("./logging");
const app = express();
const expressWinston = require('express-winston')

const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 4001;
const { /*CheckJWT,*/ SocketIoJwtAuthenticateAndAuthorize } = require('./config/authorization');
//const jwtAuthz = require('express-jwt-authz');

const DataProvider = require("./config/database");

app.use(cors());
app.use(bodyParser.json());
app.use(expressWinston.logger({
  winstonInstance: logger,
  msg: '{{res.statusCode}} {{req.method}} {{req.url}} {{res.responseTime}}ms',
  meta: false,
}));
const socket_auth = io.of("/nsAuth");
const socket_ro = io.of("/nsRO");

// handle authenticated socketIO
socket_auth.on('connect', SocketIoJwtAuthenticateAndAuthorize(['read:order_config', 'write:order_config']))
  .on('authenticated', (socket) => {
    logger.info("New client authenticated. %o", socket.decoded_token);
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
  logger.info("client info: %o ", socket.client.request.headers);
  socket.emit('WCP_SERVICES', DataProvider.Services);
  socket.emit('WCP_LEAD_TIMES', DataProvider.LeadTimes);
  socket.emit('WCP_BLOCKED_OFF', DataProvider.BlockedOff);
  socket.emit('WCP_SETTINGS', DataProvider.Settings);
});

server.listen(PORT, function () {
  logger.info("Server is running on Port: " + PORT);
});

module.exports = server;