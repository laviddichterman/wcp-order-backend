const mongoose = require('mongoose');
const logger = require('../logging');

mongoose.Promise = global.Promise;

mongoose.connect('mongodb://127.0.0.1:27017/wcp_05',
  { useNewUrlParser: true, useUnifiedTopology: true })
  .then(
    () => {
      logger.info("MongoDB database connection established successfully");
    },
    err => {
      logger.crit("Failed to connect to MongoDB %o", err);
    }
  );
const connection = mongoose.connection;

module.exports = connection;