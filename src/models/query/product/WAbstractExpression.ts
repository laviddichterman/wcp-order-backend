import {
  AbstractExpressionConstLiteral,
  AbstractExpressionHasAnyOfModifierExpression,
  AbstractExpressionIfElseExpression,
  AbstractExpressionLogicalExpression,
  AbstractExpressionModifierPlacementExpression,
  AbstractExpressionProductMetadata,
  IAbstractExpression,
  MetadataField,
  LogicalFunctionOperator,
  ProductInstanceFunctionType,
  PRODUCT_LOCATION
} from "@wcp/wcpshared";
import { Schema } from "mongoose";
import { WConstLiteralSchema } from "../WConstLiteral";

export const WAbstractExpressionSchema = new Schema<IAbstractExpression>({
  discriminator: {
    type: String,
    enum: ProductInstanceFunctionType,
    required: true
  },
  expr: {
    type: Schema.Types.Mixed,
    required: true
  }
}, { _id: false, discriminatorKey: 'discriminator', toJSON: { virtuals: true }, toObject: { virtuals: true } });

export const AbstractExpressionConstLiteralSchema = WAbstractExpressionSchema.discriminator(ProductInstanceFunctionType.ConstLiteral,
  new Schema<AbstractExpressionConstLiteral>({
    expr: { 
      type: WConstLiteralSchema,
      required: true
    }
  }, { _id: false, discriminatorKey: 'discriminator', toJSON: { virtuals: true }, toObject: { virtuals: true } }));
export const AbstractExpressionHasAnyOfModifierExpressionSchema = WAbstractExpressionSchema.discriminator(ProductInstanceFunctionType.HasAnyOfModifierType,
  new Schema<AbstractExpressionHasAnyOfModifierExpression>({
    expr: { 
      mtid: {
        type: String,
        required: true
      }
    }
  }, { _id: false, discriminatorKey: 'discriminator', toJSON: { virtuals: true }, toObject: { virtuals: true } }));
export const AbstractExpressionIfElseExpressionSchema = WAbstractExpressionSchema.discriminator(ProductInstanceFunctionType.IfElse,
  new Schema<AbstractExpressionIfElseExpression>({
    expr: {
      true_branch: { type: WAbstractExpressionSchema, required: true },
      false_branch: { type: WAbstractExpressionSchema, required: true },
      test: { type: WAbstractExpressionSchema, required: true },
    }
  }, { _id: false, discriminatorKey: 'discriminator', toJSON: { virtuals: true }, toObject: { virtuals: true } }));
export const AbstractExpressionLogicalExpressionSchema = WAbstractExpressionSchema.discriminator(ProductInstanceFunctionType.Logical,
  new Schema<AbstractExpressionLogicalExpression>({
    expr: {
      operandA: { type: WAbstractExpressionSchema, required: true },
      operandB: WAbstractExpressionSchema,
      operator: {
        type: String,
        enum: LogicalFunctionOperator,
        required: true
      }
    }
  }, { _id: false, discriminatorKey: 'discriminator', toJSON: { virtuals: true }, toObject: { virtuals: true } }));
export const AbstractExpressionModifierPlacementExpressionSchema = WAbstractExpressionSchema.discriminator(ProductInstanceFunctionType.ModifierPlacement,
  new Schema<AbstractExpressionModifierPlacementExpression>({
    expr: {
      mtid: String,
      moid: String
    }
  }, { _id: false, discriminatorKey: 'discriminator', toJSON: { virtuals: true }, toObject: { virtuals: true } }));
export const AbstractExpressionProductMetadataSchema = WAbstractExpressionSchema.discriminator(ProductInstanceFunctionType.ProductMetadata,
  new Schema<AbstractExpressionProductMetadata>({
    expr: {
      field: {
        type: String,
        enum: MetadataField,
        required: true
      },
      location: {
        type: String,
        enum: PRODUCT_LOCATION,
        required: true
      },
    }
  }, { _id: false, discriminatorKey: 'discriminator', toJSON: { virtuals: true }, toObject: { virtuals: true } }));