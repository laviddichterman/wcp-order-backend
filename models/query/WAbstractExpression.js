const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WAbstractExpression = new Schema({
  const_literal: { type: Schema.Types.ObjectId, ref: 'WConstLiteral' },
  if_else: { type: Schema.Types.ObjectId, ref: 'WIfElse' },
  logical: { type: Schema.Types.ObjectId, ref: 'WLogicalOperator' },
  modifier_placement: { type: Schema.Types.ObjectId, ref: 'WModifierPlacementExtractionOperator' },
  discriminator: {
    type: String,
    enum: ['ConstLiteral', 'IfElse', 'Logical', 'ModifierPlacement'],
    required: true
  }
});

module.exports = WAbstractExpression;