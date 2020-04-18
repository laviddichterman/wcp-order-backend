const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const ExternalIDsSchema = require("./ExternalIDsSchema");

var WOptionTypeSchema = new Schema({
  // id
  _id: { type: String, required: true },

  // Human readable name
  name: { type: String, required: true },

  // external ids
  externalIDs: ExternalIDsSchema,

  // ordinal
  ordinal: { type: Number, required: true },
  
  // selection type
  selection_type: {
    type: String,
    enum: ['SINGLE', 'MANY'],
    required: true
  }
});

module.exports = WOptionTypeSchema;
