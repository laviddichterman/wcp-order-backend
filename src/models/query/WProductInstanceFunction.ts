import { WAbstractExpression } from "./WAbstractExpression";
import mongoose, { Schema } from "mongoose";
import path from 'path';
import { IProductInstanceFunction } from "@wcp/wcpshared";
type MT = Omit<IProductInstanceFunction, "id">;
export const WProductInstanceFunction = new Schema<MT>({
  expression: WAbstractExpression,
  name: { type: String, required: true }
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export const WProductInstanceFunctionModel = mongoose.model<IProductInstanceFunction>(path.basename(__filename).replace(path.extname(__filename), ''), WProductInstanceFunction);
