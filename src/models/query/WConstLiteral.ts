import {
  ConstLiteralDiscriminator,
  ConstBooleanLiteralExpression,
  ConstModifierPlacementLiteralExpression,
  ConstModifierQualifierLiteralExpression,
  ConstNumberLiteralExpression,
  ConstStringLiteralExpression,
  IConstLiteralExpression,
  OptionPlacement,
  OptionQualifier
} from "@wcp/wcpshared";
import { Schema } from "mongoose";

export const WConstLiteralSchema = new Schema<IConstLiteralExpression>({
  value: Schema.Types.Mixed,
  discriminator: {
    type: String,
    enum: ConstLiteralDiscriminator,
    required: true
  }
}, { _id: false, discriminatorKey: 'discriminator' });

export const WConstStringLiteralExpressionSchema = WConstLiteralSchema.discriminator(ConstLiteralDiscriminator.STRING,
  new Schema<ConstStringLiteralExpression>({
    value: {
      type: String,
      required: true
    }
  }, { _id: false, discriminatorKey: 'discriminator' }));

export const WConstNumberLiteralExpressionSchema = WConstLiteralSchema.discriminator(ConstLiteralDiscriminator.NUMBER,
  new Schema<ConstNumberLiteralExpression>({
    value: { type: Number, required: true }
  }, { _id: false, discriminatorKey: 'discriminator' }));
export const WConstBooleanLiteralExpressionSchema = WConstLiteralSchema.discriminator(ConstLiteralDiscriminator.BOOLEAN,
  new Schema<ConstBooleanLiteralExpression>({
    value: { type: Boolean, required: true }
  }, { _id: false, discriminatorKey: 'discriminator' }));
export const WConstModifierPlacementLiteralExpressionSchema = WConstLiteralSchema.discriminator(ConstLiteralDiscriminator.MODIFIER_PLACEMENT,
  new Schema<ConstModifierPlacementLiteralExpression>({
    value: { type: Number, enum: OptionPlacement, required: true }
  }, { _id: false, discriminatorKey: 'discriminator' }));
export const WConstModifierQualifierLiteralExpressionSchema = WConstLiteralSchema.discriminator(ConstLiteralDiscriminator.MODIFIER_QUALIFIER,
  new Schema<ConstModifierQualifierLiteralExpression>({
    value: { type: Number, enum: OptionQualifier, required: true }
  }, { _id: false, discriminatorKey: 'discriminator' }));  
