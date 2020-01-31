const mongoose = require('mongoose');
const logger = require('../logging');
const process = require('process');

mongoose.Promise = global.Promise;

mongoose.connect('mongodb://127.0.0.1:27017/wcp_05',
  { useNewUrlParser: true, useUnifiedTopology: true })
  .then(
    () => {
      logger.info("MongoDB database connection established successfully");
    },
    err => {
      logger.error("Failed to connect to MongoDB %o", err);
      process.exit(1);
    }
  );
const connection = mongoose.connection;

module.exports = connection;