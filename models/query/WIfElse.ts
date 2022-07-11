import { Schema } from "mongoose";
import {WAbstractExpression} from "./WAbstractExpression";

export const WIfElse = new Schema({
  true_branch: WAbstractExpression,
  false_branch: WAbstractExpression,
  test: WAbstractExpression
});

module.exports = WIfElse;