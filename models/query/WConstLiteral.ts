import { Schema } from "mongoose";

export const WConstLiteral = new Schema({
  value: Schema.Types.Mixed
});

module.exports = WConstLiteral;