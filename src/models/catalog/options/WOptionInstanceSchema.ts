import mongoose, {Schema} from "mongoose";
import { IWOptionInstance, OptionPlacement, OptionQualifier } from "@wcp/wcpshared";
import path from "path";

export const WOptionInstanceSchema = new Schema<IWOptionInstance>({
  option_id: {
    type: String,
    required: true
  },

  placement: {
    type: String,
    enum: OptionPlacement,
    required: true
  },

  qualifier: {
    type: String,
    enum: OptionQualifier,
    required: true
  }
}, { _id: false});

export default mongoose.model<IWOptionInstance>(path.basename(__filename).replace(path.extname(__filename), ''), WOptionInstanceSchema);