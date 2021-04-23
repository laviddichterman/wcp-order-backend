const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WAbstractExpression = new Schema({
  const_literal: Schema.Types.Mixed,//{ type: Schema.Types.ObjectId, ref: 'WConstLiteral' },
  if_else: Schema.Types.Mixed,//{ type: Schema.Types.ObjectId, ref: 'WIfElse' },
  logical: Schema.Types.Mixed,//{ type: Schema.Types.ObjectId, ref: 'WLogicalOperator' },
  modifier_placement: Schema.Types.Mixed,//{ type: Schema.Types.ObjectId, ref: 'WModifierPlacementExtractionOperator' },
  has_any_of_modifier: Schema.Types.Mixed,//{ type: Schema.Types.ObjectId, ref: 'WHasAnyOfModifierType' },
  discriminator: {
    type: String,
    enum: ['ConstLiteral', 'IfElse', 'Logical', 'ModifierPlacement', 'HasAnyOfModifierType'],
    required: true
  }
});

module.exports = WAbstractExpression;