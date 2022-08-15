import { LogicalFunctionOperator, ILogicalExpression, IAbstractExpression } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import { WAbstractExpression } from "./WAbstractExpression";
import path from 'path';

export const WLogicalOperator = new Schema<ILogicalExpression<IAbstractExpression>>({
  operandA: { type: WAbstractExpression, required: true },
  // operand B is ignored in the case of the NOT operator 
  operandB: WAbstractExpression,
  operator: {
    type: String,
    enum: LogicalFunctionOperator,
    required: true
  }
});
export default mongoose.model<ILogicalExpression<IAbstractExpression>>(path.basename(__filename).replace(path.extname(__filename), ''), WLogicalOperator);