import { Schema } from "mongoose";
import { WAbstractExpression } from "./WAbstractExpression";

export const WProductInstanceFunction = new Schema({
  expression: WAbstractExpression,
  name: String
});

module.exports = WProductInstanceFunction;