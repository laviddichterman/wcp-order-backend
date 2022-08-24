import {
  AbstractOrderExpressionConstLiteral,
  AbstractOrderExpressionIfElseExpression,
  AbstractOrderExpressionLogicalExpression,
  LogicalFunctionOperator,
  OrderInstanceFunctionType,
  AbstractOrderExpression
} from "@wcp/wcpshared";
import { Schema } from "mongoose";
import { WConstLiteralSchema } from "../WConstLiteral";

export const WAbstractOrderExpressionSchema = new Schema<AbstractOrderExpression>({
  discriminator: {
    type: String,
    enum: OrderInstanceFunctionType,
    required: true
  }
},
  { _id: false, discriminatorKey: 'discriminator', toJSON: { virtuals: true }, toObject: { virtuals: true } });

export const AbstractOrderExpressionConstLiteralSchema = WAbstractOrderExpressionSchema.discriminator(OrderInstanceFunctionType.ConstLiteral,
  new Schema<AbstractOrderExpressionConstLiteral>({
    expr: {
      type: WConstLiteralSchema,
      required: true
    }
  }, { _id: false, discriminatorKey: 'discriminator', toJSON: { virtuals: true }, toObject: { virtuals: true } }));


export const AbstractOrderExpressionIfElseSchema = WAbstractOrderExpressionSchema.discriminator(OrderInstanceFunctionType.IfElse,
  new Schema<AbstractOrderExpressionIfElseExpression>({
    expr: {
      true_branch: WAbstractOrderExpressionSchema,
      false_branch: WAbstractOrderExpressionSchema,
      test: WAbstractOrderExpressionSchema
    }
  }, { _id: false, discriminatorKey: 'discriminator', toJSON: { virtuals: true }, toObject: { virtuals: true } }));

export const AbstractOrderExpressionLogicalExpressionSchema = WAbstractOrderExpressionSchema.discriminator(OrderInstanceFunctionType.Logical,
  new Schema<AbstractOrderExpressionLogicalExpression>({
    expr: {
      operandA: { type: WAbstractOrderExpressionSchema, required: true },
      operandB: WAbstractOrderExpressionSchema,
      operator: {
        type: String,
        enum: LogicalFunctionOperator,
        required: true
      }
    }
  }, { _id: false, discriminatorKey: 'discriminator', toJSON: { virtuals: true }, toObject: { virtuals: true } }));