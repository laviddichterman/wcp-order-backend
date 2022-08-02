import { AbstractExpressionConstLiteral, AbstractExpressionHasAnyOfModifierExpression, AbstractExpressionIfElseExpression, AbstractExpressionLogicalExpression, AbstractExpressionModifierPlacementExpression, AbstractExpressionProductMetadata, IAbstractExpression, IConstLiteralExpression, IHasAnyOfModifierExpression, IIfElseExpression, ILogicalExpression, IModifierPlacementExpression, ProductInstanceFunctionType, ProductMetadataExpression } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';

export const WAbstractExpression = new Schema<IAbstractExpression>({
  //expr: Schema.Types.Mixed,
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
  expr: { value: Schema.Types.Mixed }
}, {_id: false}));
export const WIfElseExpressionModel = WAbstractExpressionModel.discriminator<AbstractExpressionIfElseExpression>(ProductInstanceFunctionType.IfElse, 
  new Schema<{ expr: IIfElseExpression }>({
  expr: { value: Schema.Types.Mixed }
}, {_id: false}));
export const WLogicalExpressionModel = WAbstractExpressionModel.discriminator<AbstractExpressionLogicalExpression>(ProductInstanceFunctionType.Logical, 
  new Schema<{ expr: ILogicalExpression }>({
  expr: { value: Schema.Types.Mixed }
}, {_id: false}));
export const WModifierPlacementExpressionModel = WAbstractExpressionModel.discriminator<AbstractExpressionModifierPlacementExpression>(ProductInstanceFunctionType.ModifierPlacement, 
  new Schema<{ expr: IModifierPlacementExpression }>({
  expr: { value: Schema.Types.Mixed }
}, {_id: false}));
export const WProductMetadataExpressionModel = WAbstractExpressionModel.discriminator<AbstractExpressionProductMetadata>(ProductInstanceFunctionType.ProductMetadata, 
  new Schema<{ expr: ProductMetadataExpression }>({
  expr: { value: Schema.Types.Mixed }
}, {_id: false}));