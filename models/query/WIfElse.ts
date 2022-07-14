import { IIfElseExpression } from "@wcp/wcpshared";
import mongoose, { Schema } from "mongoose";
import {WAbstractExpression} from "./WAbstractExpression";
import path from 'path';

export const WIfElse = new Schema<IIfElseExpression>({
  true_branch: WAbstractExpression,
  false_branch: WAbstractExpression,
  test: WAbstractExpression
});

export default mongoose.model<IIfElseExpression>(path.basename(__filename).replace(path.extname(__filename), ''), WIfElse);
