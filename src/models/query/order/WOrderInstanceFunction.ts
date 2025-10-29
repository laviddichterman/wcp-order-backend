import mongoose, { Schema } from "mongoose";
import path from 'path';
import { OrderInstanceFunction } from "@wcp/wario-shared";
import { WAbstractOrderExpressionSchema } from "./WAbstractOrderExpression";

type MT = Omit<OrderInstanceFunction, "id">;

export const OrderInstanceFunctionSchema = new Schema<MT>({
  expression: WAbstractOrderExpressionSchema,
  name: { type: String, required: true }
}, { id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

export const WOrderInstanceFunctionModel = mongoose.model<OrderInstanceFunction>(path.basename(__filename).replace(path.extname(__filename), ''), OrderInstanceFunctionSchema);
