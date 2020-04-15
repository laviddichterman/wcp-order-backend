const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ExternalIDsSchema = new Schema({
  // external ids
  revelID: String,
  sqID: String
});

module.exports = ExternalIDsSchema;
