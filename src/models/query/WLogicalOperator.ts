import { ProductInstanceFunctionOperator, ILogicalExpression } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import { WAbstractExpression } from "./WAbstractExpression";
import path from 'path';

export const WLogicalOperator = new Schema<ILogicalExpression>({
  operandA: { type: WAbstractExpression, required: true },
  // operand B is ignored in the case of the NOT operator 
  operandB: WAbstractExpression,
  operator: {
    type: String,
    enum: ProductInstanceFunctionOperator,
    required: true
  }
});
export default mongoose.model<ILogicalExpression>(path.basename(__filename).replace(path.extname(__filename), ''), WLogicalOperator);