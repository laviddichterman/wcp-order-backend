import { 
  ConstLiteralDiscriminator, 
  ConstBooleanLiteralExpression, 
  ConstModifierPlacementLiteralExpression, 
  ConstModifierQualifierLiteralExpression, 
  ConstNumberLiteralExpression, 
  ConstStringLiteralExpression, 
  IConstLiteralExpression, 
  OptionPlacement, 
  OptionQualifier } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';

export const WConstLiteral = new Schema<IConstLiteralExpression>({
  value: Schema.Types.Mixed,
  discriminator: {
    type: String,
    enum: ConstLiteralDiscriminator,
    required: true
  }
}, {_id: false, discriminatorKey: 'discriminator'});

export const WConstLiteralModel = mongoose.model<IConstLiteralExpression>(path.basename(__filename).replace(path.extname(__filename), ''), WConstLiteral);
export const WConstStringLiteralExpressionModel = WConstLiteralModel.discriminator<ConstStringLiteralExpression>(ConstLiteralDiscriminator.STRING, 
  new Schema<{ value: String }>({
  value: { type: String, required: true }
}, {_id: false, discriminatorKey: 'discriminator'}));
export const WConstNumberLiteralExpressionModel = WConstLiteralModel.discriminator<ConstNumberLiteralExpression>(ConstLiteralDiscriminator.NUMBER, 
  new Schema<{ value: Number }>({
  value: { type: Number, required: true }
}, {_id: false, discriminatorKey: 'discriminator'}));
export const WConstBooleanLiteralExpressionModel = WConstLiteralModel.discriminator<ConstBooleanLiteralExpression>(ConstLiteralDiscriminator.BOOLEAN, 
  new Schema<{ value: Boolean }>({
  value: { type: Boolean, required: true }
}, {_id: false, discriminatorKey: 'discriminator'}));
export const WConstModifierPlacementLiteralExpressionModel = WConstLiteralModel.discriminator<ConstModifierPlacementLiteralExpression>(ConstLiteralDiscriminator.MODIFIER_PLACEMENT, 
  new Schema<{ value: OptionPlacement }>({
  value: { type: Number, enum: OptionPlacement, required: true }
}, {_id: false, discriminatorKey: 'discriminator'}));
export const WConstModifierQualifierLiteralExpressionModel = WConstLiteralModel.discriminator<ConstModifierQualifierLiteralExpression>(ConstLiteralDiscriminator.MODIFIER_QUALIFIER, 
  new Schema<{ value: OptionQualifier }>({
  value: { type: Number, enum: OptionQualifier, required: true }
}, {_id: false, discriminatorKey: 'discriminator'}));  

export const ConstLiteralExpressionToModel = function(expr : IConstLiteralExpression) {
  switch (expr.discriminator) {
    case ConstLiteralDiscriminator.BOOLEAN:
      return new WConstBooleanLiteralExpressionModel({ discriminator: ConstLiteralDiscriminator.BOOLEAN, value: expr.value });
    case ConstLiteralDiscriminator.STRING:
      return new WConstStringLiteralExpressionModel({ discriminator: ConstLiteralDiscriminator.STRING, value: expr.value });
    case ConstLiteralDiscriminator.NUMBER:
      return new WConstNumberLiteralExpressionModel({ discriminator: ConstLiteralDiscriminator.NUMBER, value: expr.value });
    case ConstLiteralDiscriminator.MODIFIER_PLACEMENT:
      return new WConstModifierPlacementLiteralExpressionModel({ discriminator: ConstLiteralDiscriminator.MODIFIER_PLACEMENT, value: expr.value });
    case ConstLiteralDiscriminator.MODIFIER_QUALIFIER:
      return new WConstModifierQualifierLiteralExpressionModel({ discriminator: ConstLiteralDiscriminator.MODIFIER_QUALIFIER, value: expr.value });
  }
}