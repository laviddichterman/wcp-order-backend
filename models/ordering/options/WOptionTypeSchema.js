const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const ExternalIDsSchema = require("../ExternalIDsSchema");

const WOptionTypeSchema = new Schema({
  // Human readable name
  name: { type: String, required: true },

  // external ids
  externalIDs: ExternalIDsSchema,

  // ordinal
  ordinal: { type: Number, required: true },

  min_selected: { type: Number, required: true },

  max_selected: { type: Number, required: false },
});

module.exports = WOptionTypeSchema;
