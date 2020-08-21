const mongoose = require("mongoose");
const Schema = mongoose.Schema;

var WAbstractExpression = new Schema({
  const_literal: String,
  if_else: String,
  logical: String,
  modifier_placement: String,
  discriminator: {
    type: String,
    enum: ['ConstLiteral', 'IfElse', 'Logical', 'ModifierPlacement'],
    required: true
  }
});

module.exports = WAbstractExpression;