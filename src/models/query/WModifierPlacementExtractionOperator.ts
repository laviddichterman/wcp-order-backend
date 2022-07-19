import { IModifierPlacementExpression } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';

export const WModifierPlacementExtractionOperator = new Schema<IModifierPlacementExpression>({
  mtid: String,
  moid: String,
});

export default mongoose.model<IModifierPlacementExpression>(path.basename(__filename).replace(path.extname(__filename), ''), WModifierPlacementExtractionOperator);
