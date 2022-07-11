import mongoose, {Schema} from "mongoose";
import { IWOptionInstance, OptionPlacement, OptionQualifier } from "@wcp/wcpshared";

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

const model = mongoose.model("WCategorySchema", WOptionInstanceSchema);
export default model;//{ schema: WOptionInstanceSchema, model, iFace: typeof IWOptionInstance };