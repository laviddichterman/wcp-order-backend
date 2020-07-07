const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// mix in, not to be instantiated directly
const ExternalIDsSchema = new Schema({
  // external ids
  revelID: String,
  squareID: String
}, { _id: false});

module.exports = ExternalIDsSchema;
