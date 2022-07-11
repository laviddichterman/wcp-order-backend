import { WAbstractExpression } from "./WAbstractExpression";
import mongoose, { Schema } from "mongoose";
import path from 'path';
import { IProductInstanceFunction } from "@wcp/wcpshared";

export const WProductInstanceFunction = new Schema<IProductInstanceFunction>({
  expression: WAbstractExpression,
  name: String
});

export default mongoose.model<IProductInstanceFunction>(path.basename(__filename).replace(path.extname(__filename), ''), WProductInstanceFunction);
