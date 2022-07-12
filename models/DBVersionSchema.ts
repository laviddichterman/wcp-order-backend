import { SEMVER } from "@wcp/wcpshared";
import mongoose, {Schema} from "mongoose";
import path from 'path';

export const DBVersionSchema = new Schema<SEMVER>({ major: Number, minor: Number, patch: Number });

export default mongoose.model<SEMVER>(path.basename(__filename).replace(path.extname(__filename), ''), DBVersionSchema);
