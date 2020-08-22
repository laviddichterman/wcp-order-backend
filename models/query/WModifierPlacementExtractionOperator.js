const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WModifierPlacementExtractionOperator = new Schema({
  mtid: String,
  moid: String,
});

module.exports = WModifierPlacementExtractionOperator;