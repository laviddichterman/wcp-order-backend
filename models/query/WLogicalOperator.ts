import { Schema } from "mongoose";
import { WAbstractExpression } from "./WAbstractExpression";

export const WLogicalOperator = new Schema({
  operandA: WAbstractExpression,
  // operand B is ignored in the case of the NOT operator 
  operandB: WAbstractExpression,
  operator: {
    type: String,
    enum: ['AND', 'OR', 'NOT', 'EQ', 'NE', 'GT', 'GE', 'LT', 'LE'],
    required: true
  }
});

module.exports = WLogicalOperator;