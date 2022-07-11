import mongoose, {Schema, Types} from "mongoose";
import path from 'path';
import { IExternalIDs } from "@wcp/wcpshared";

// mix in, not to be instantiated directly
export const ExternalIDsSchema = new Schema<IExternalIDs>({
  // external ids
  revelID: String,
  squareID: String
}, { _id: false});

// export default mongoose.model<IExternalIDs>(path.basename(__filename).replace(path.extname(__filename), ""), ExternalIDsSchema);
module.exports = ExternalIDsSchema;
