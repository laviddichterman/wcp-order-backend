import { IHasAnyOfModifierExpression } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';

export const WHasAnyOfModifierType = new Schema<IHasAnyOfModifierExpression>({
  mtid: String
});

export default mongoose.model<IHasAnyOfModifierExpression>(path.basename(__filename).replace(path.extname(__filename), ''), WHasAnyOfModifierType);

