import { AbstractExpressionConstLiteral, 
  AbstractExpressionHasAnyOfModifierExpression, 
  AbstractExpressionIfElseExpression, 
  AbstractExpressionLogicalExpression, 
  AbstractExpressionModifierPlacementExpression, 
  AbstractExpressionProductMetadata, 
  IAbstractExpression, 
  IConstLiteralExpression, 
  IHasAnyOfModifierExpression, 
  IIfElseExpression, 
  ILogicalExpression, 
  IModifierPlacementExpression, 
  MetadataField, 
  ProductInstanceFunctionOperator, 
  ProductInstanceFunctionType, 
  ProductMetadataExpression, 
  PRODUCT_LOCATION } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';
import { ConstLiteralExpressionToModel } from "./WConstLiteral";

export const WAbstractExpression = new Schema<IAbstractExpression>({
  expr: { 
    type: Schema.Types.Mixed,
    required: true
  },
  discriminator: {
    type: String,
    enum: ProductInstanceFunctionType,
    required: true
  }
}, {_id: false, discriminatorKey: 'discriminator'});


export const WAbstractExpressionModel = mongoose.model<IAbstractExpression>(path.basename(__filename).replace(path.extname(__filename), ''), WAbstractExpression);
export const WConstLiteralExpressionModel = WAbstractExpressionModel.discriminator<AbstractExpressionConstLiteral>(ProductInstanceFunctionType.ConstLiteral, 
  new Schema<{ expr: IConstLiteralExpression }>({
  expr: { value: Schema.Types.Mixed }
}, {_id: false}));
export const WHasAnyOfModifierExpressionModel = WAbstractExpressionModel.discriminator<AbstractExpressionHasAnyOfModifierExpression>(ProductInstanceFunctionType.HasAnyOfModifierType, 
  new Schema<{ expr: IHasAnyOfModifierExpression }>({
  expr: { mtid: String }
}, {_id: false}));
export const WIfElseExpressionModel = WAbstractExpressionModel.discriminator<AbstractExpressionIfElseExpression>(ProductInstanceFunctionType.IfElse, 
  new Schema<{ expr: IIfElseExpression }>({
  expr: { 
    true_branch: Schema.Types.Mixed,
    false_branch: Schema.Types.Mixed,
    test: Schema.Types.Mixed,
  }
}, {_id: false}));
export const WLogicalExpressionModel = WAbstractExpressionModel.discriminator<AbstractExpressionLogicalExpression>(ProductInstanceFunctionType.Logical, 
  new Schema<{ expr: ILogicalExpression }>({
  expr: {   
    operandA: { type: Schema.Types.Mixed, required: true },
    operandB: Schema.Types.Mixed,
    operator: { 
      type: String,
      enum: ProductInstanceFunctionOperator,
      required: true
    }
  }
}, {_id: false}));
export const WModifierPlacementExpressionModel = WAbstractExpressionModel.discriminator<AbstractExpressionModifierPlacementExpression>(ProductInstanceFunctionType.ModifierPlacement, 
  new Schema<{ expr: IModifierPlacementExpression }>({
  expr: {   
    mtid: String,
    moid: String
  }
}, {_id: false}));
export const WProductMetadataExpressionModel = WAbstractExpressionModel.discriminator<AbstractExpressionProductMetadata>(ProductInstanceFunctionType.ProductMetadata, 
  new Schema<{ expr: ProductMetadataExpression }>({
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
}, {_id: false}));

export const ExpressionToMongooseModel = function(expr : IAbstractExpression) : any {
  switch (expr.discriminator) { 
    case ProductInstanceFunctionType.ConstLiteral:
      // THIS IS BULLSHIT, Can't figure out why the const literal expressions aren't picking up the discriminator
      // needs to be fixed :\
      return new WConstLiteralExpressionModel({ 
        expr: ConstLiteralExpressionToModel(expr.expr), 
        discriminator: ProductInstanceFunctionType.ConstLiteral });
    case ProductInstanceFunctionType.HasAnyOfModifierType:
      return new WHasAnyOfModifierExpressionModel({ 
        expr: { mtid: expr.expr.mtid }, 
        discriminator: ProductInstanceFunctionType.HasAnyOfModifierType });
    case ProductInstanceFunctionType.IfElse:
      return new WIfElseExpressionModel({ 
        expr: { false_branch: ExpressionToMongooseModel(expr.expr.false_branch), true_branch: ExpressionToMongooseModel(expr.expr.true_branch), test: ExpressionToMongooseModel(expr.expr.test) }, 
        discriminator: ProductInstanceFunctionType.IfElse });
    case ProductInstanceFunctionType.Logical:
      return new WLogicalExpressionModel({ 
        expr: { operandA: ExpressionToMongooseModel(expr.expr.operandA), operandB: expr.expr.operandB ? ExpressionToMongooseModel(expr.expr.operandB) : undefined, operator: expr.expr.operator }, 
        discriminator: ProductInstanceFunctionType.Logical });
    case ProductInstanceFunctionType.ModifierPlacement:
      return new WModifierPlacementExpressionModel({ 
        expr: { mtid: expr.expr.mtid, moid: expr.expr.moid }, 
        discriminator: ProductInstanceFunctionType.ModifierPlacement });
    case ProductInstanceFunctionType.ProductMetadata:
      return new WProductMetadataExpressionModel({ 
        expr: { field: expr.expr.field, location: expr.expr.location }, 
        discriminator: ProductInstanceFunctionType.ProductMetadata });
  }
}