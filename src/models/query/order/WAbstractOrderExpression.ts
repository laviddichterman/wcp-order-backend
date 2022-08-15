import { AbstractOrderExpressionConstLiteral, 
  AbstractOrderExpressionIfElseExpression, 
  AbstractOrderExpressionLogicalExpression, 
  IConstLiteralExpression, 
  IIfElseExpression, 
  ILogicalExpression, 
  LogicalFunctionOperator, 
  ProductInstanceFunctionType, 
  OrderInstanceFunctionType,
  AbstractOrderExpression} from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';
import { ConstLiteralExpressionToModel } from "../WConstLiteral";

export const WAbstractOrderExpression = new Schema<AbstractOrderExpression>({
  expr: { 
    type: Schema.Types.Mixed,
    required: true
  },
  discriminator: {
    type: String,
    enum: OrderInstanceFunctionType,
    required: true
  }
}, {_id: false, discriminatorKey: 'discriminator'});


export const WAbstractOrderExpressionModel = mongoose.model<AbstractOrderExpression>(path.basename(__filename).replace(path.extname(__filename), ''), WAbstractOrderExpression);
export const WConstLiteralExpressionModel = WAbstractOrderExpressionModel.discriminator<AbstractOrderExpressionConstLiteral>(OrderInstanceFunctionType.ConstLiteral, 
  new Schema<{ expr: IConstLiteralExpression }>({
  expr: { value: Schema.Types.Mixed }
}, {_id: false}));
export const WIfElseExpressionModel = WAbstractOrderExpressionModel.discriminator<AbstractOrderExpressionIfElseExpression>(OrderInstanceFunctionType.IfElse, 
  new Schema<{ expr: IIfElseExpression<AbstractOrderExpression> }>({
  expr: { 
    true_branch: Schema.Types.Mixed,
    false_branch: Schema.Types.Mixed,
    test: Schema.Types.Mixed,
  }
}, {_id: false}));
export const WOrderLogicalExpressionModel = WAbstractOrderExpressionModel.discriminator<AbstractOrderExpressionLogicalExpression>(OrderInstanceFunctionType.Logical, 
  new Schema<{ expr: ILogicalExpression<AbstractOrderExpression> }>({
  expr: {   
    operandA: { type: Schema.Types.Mixed, required: true },
    operandB: Schema.Types.Mixed,
    operator: { 
      type: String,
      enum: LogicalFunctionOperator,
      required: true
    }
  }
}, {_id: false}));

export const OrderExpressionToMongooseModel = function(expr : AbstractOrderExpression) : any {
  switch (expr.discriminator) { 
    case OrderInstanceFunctionType.ConstLiteral:
      // THIS IS BULLSHIT, Can't figure out why the const literal expressions aren't picking up the discriminator
      // needs to be fixed :\
      return new WConstLiteralExpressionModel({ 
        expr: ConstLiteralExpressionToModel(expr.expr), 
        discriminator: OrderInstanceFunctionType.ConstLiteral });
    case OrderInstanceFunctionType.IfElse:
      return new WIfElseExpressionModel({ 
        expr: { false_branch: OrderExpressionToMongooseModel(expr.expr.false_branch), true_branch: OrderExpressionToMongooseModel(expr.expr.true_branch), test: OrderExpressionToMongooseModel(expr.expr.test) }, 
        discriminator: ProductInstanceFunctionType.IfElse });
    case OrderInstanceFunctionType.Logical:
      return new WOrderLogicalExpressionModel({ 
        expr: { operandA: OrderExpressionToMongooseModel(expr.expr.operandA), operandB: expr.expr.operandB ? OrderExpressionToMongooseModel(expr.expr.operandB) : undefined, operator: expr.expr.operator }, 
        discriminator: ProductInstanceFunctionType.Logical });

  }
}