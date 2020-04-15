const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const ExternalIDsSchema = require("./ExternalIDsSchema");

var WOptionTypeSchema = new Schema({
  // id
  _id: { type: String, required: true },

  // Human readable name
  name: String,

  // external ids
  externalIDs: ExternalIDsSchema,

  // ordinal
  ordinal: Number,
  
  // selection type
  selection_type: {
    type: String,
    enum: ['SINGLE', 'MANY']
  }
});

module.exports = WOptionTypeSchema;
