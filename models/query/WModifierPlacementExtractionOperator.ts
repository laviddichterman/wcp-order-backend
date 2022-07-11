import { Schema } from "mongoose";

export const WModifierPlacementExtractionOperator = new Schema({
  mtid: String,
  moid: String,
});

module.exports = WModifierPlacementExtractionOperator;