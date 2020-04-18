const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// mix in, not to be instantiated directly
const ExternalIDsSchema = new Schema({
  // external ids
  revelID: String,
  sqID: String
});

module.exports = ExternalIDsSchema;
