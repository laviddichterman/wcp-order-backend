import { WAbstractOrderExpression } from "./WAbstractOrderExpression";
import mongoose, { Schema } from "mongoose";
import path from 'path';
import { IProductInstanceFunction, OrderInstanceFunction } from "@wcp/wcpshared";
type MT = Omit<OrderInstanceFunction, "id">;
export const WOrderInstanceFunction = new Schema<MT>({
  expression: WAbstractOrderExpression,
  name: { type: String, required: true }
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export const WOrderInstanceFunctionModel = mongoose.model<OrderInstanceFunction>(path.basename(__filename).replace(path.extname(__filename), ''), WOrderInstanceFunction);
