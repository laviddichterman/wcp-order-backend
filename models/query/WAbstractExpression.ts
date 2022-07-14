import { IAbstractExpression, ProductInstanceFunctionType } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';

export const WAbstractExpression = new Schema<IAbstractExpression>({
  const_literal: Schema.Types.Mixed,//{ type: Schema.Types.ObjectId, ref: 'WConstLiteral' },
  if_else: Schema.Types.Mixed,//{ type: Schema.Types.ObjectId, ref: 'WIfElse' },
  logical: Schema.Types.Mixed,//{ type: Schema.Types.ObjectId, ref: 'WLogicalOperator' },
  modifier_placement: Schema.Types.Mixed,//{ type: Schema.Types.ObjectId, ref: 'WModifierPlacementExtractionOperator' },
  has_any_of_modifier: Schema.Types.Mixed,//{ type: Schema.Types.ObjectId, ref: 'WHasAnyOfModifierType' },
  // fulfillmentInfo -- something that can check for fulfillment conditions (to disable slicing modifier on dine-in at BTP, disable slushy size on dine-in at windy )
  // metadata -- we need something that can read an arbitrary field in metadata 
  discriminator: {
    type: String,
    enum: ['ConstLiteral', 'IfElse', 'Logical', 'ModifierPlacement', 'HasAnyOfModifierType'],//, 'MetadataSum'],
    required: true
  }
}, {_id: false});


export default mongoose.model<IAbstractExpression>(path.basename(__filename).replace(path.extname(__filename), ''), WAbstractExpression);