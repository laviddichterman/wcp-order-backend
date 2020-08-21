const mongoose = require("mongoose");
const Schema = mongoose.Schema;

var WModifierPlacementExtractionOperator = new Schema({
  mtid: String,
  moid: String,
});

module.exports = WModifierPlacementExtractionOperator;