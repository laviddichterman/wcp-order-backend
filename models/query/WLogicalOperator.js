const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const WAbstractExpression = require("./WAbstractExpression");

var WLogicalOperator = new Schema({
  operandA: WAbstractExpression,
  // operand B is ignored in the case of the NOT operator 
  operandB: WAbstractExpression,
  operator: {
    type: String,
    enum: ['AND', 'OR', 'NOT', 'EQUALS', 'GT', 'GE', 'LT', 'LE'],
    required: true
  }
});

module.exports = WLogicalOperator;