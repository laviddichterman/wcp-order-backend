import { ConstBooleanLiteralExpression, ConstLiteralDiscriminator, ConstModifierPlacementLiteralExpression, ConstModifierQualifierLiteralExpression, ConstNumberLiteralExpression, ConstStringLiteralExpression, IConstLiteralExpression, OptionPlacement, OptionQualifier } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';

export const WConstLiteral = new Schema<IConstLiteralExpression>({
  //expr: Schema.Types.Mixed,
  discriminator: {
    type: String,
    enum: ConstLiteralDiscriminator,
    required: true
  }
}, {_id: false, discriminatorKey: 'discriminator'});

export const WConstLiteralModel = mongoose.model<IConstLiteralExpression>(path.basename(__filename).replace(path.extname(__filename), ''), WConstLiteral);
export const WConstStringLiteralExpressionModel = WConstLiteralModel.discriminator<ConstStringLiteralExpression>(ConstLiteralDiscriminator.STRING, 
  new Schema<{ value: String }>({
  value: Schema.Types.Mixed
}, {_id: false}));
export const WConstNumberLiteralExpressionModel = WConstLiteralModel.discriminator<ConstNumberLiteralExpression>(ConstLiteralDiscriminator.NUMBER, 
  new Schema<{ value: Number }>({
  value: Schema.Types.Mixed
}, {_id: false}));
export const WConstBooleanLiteralExpressionModel = WConstLiteralModel.discriminator<ConstBooleanLiteralExpression>(ConstLiteralDiscriminator.BOOLEAN, 
  new Schema<{ value: Boolean }>({
  value: Schema.Types.Mixed
}, {_id: false}));
export const WConstModifierPlacementLiteralExpressionModel = WConstLiteralModel.discriminator<ConstModifierPlacementLiteralExpression>(ConstLiteralDiscriminator.MODIFIER_PLACEMENT, 
  new Schema<{ value: OptionPlacement }>({
  value: Schema.Types.Mixed
}, {_id: false}));
export const WConstModifierQualifierLiteralExpressionModel = WConstLiteralModel.discriminator<ConstModifierQualifierLiteralExpression>(ConstLiteralDiscriminator.MODIFIER_QUALIFIER, 
  new Schema<{ value: OptionQualifier }>({
  value: Schema.Types.Mixed
}, {_id: false}));  