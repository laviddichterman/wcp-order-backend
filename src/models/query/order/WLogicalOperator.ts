import { LogicalFunctionOperator, ILogicalExpression, AbstractOrderExpression } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import { WAbstractOrderExpression } from "./WAbstractOrderExpression";
import path from 'path';

export const WOrderLogicalOperator = new Schema<ILogicalExpression<AbstractOrderExpression>>({
  operandA: { type: WAbstractOrderExpression, required: true },
  // operand B is ignored in the case of the NOT operator 
  operandB: WAbstractOrderExpression,
  operator: {
    type: String,
    enum: LogicalFunctionOperator,
    required: true
  }
});
export default mongoose.model<ILogicalExpression<AbstractOrderExpression>>(path.basename(__filename).replace(path.extname(__filename), ''), WOrderLogicalOperator);