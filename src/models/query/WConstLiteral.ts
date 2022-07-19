import { IConstLiteralExpression } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import path from 'path';

export const WConstLiteral = new Schema<IConstLiteralExpression>({
  value: Schema.Types.Mixed
});

export default mongoose.model<IConstLiteralExpression>(path.basename(__filename).replace(path.extname(__filename), ''), WConstLiteral);