import { Schema } from "mongoose";
import { IOptionInstance, OptionPlacement, OptionQualifier } from "@wcp/wcpshared";

export const WOptionInstanceSchema = new Schema<IOptionInstance>({
  option_id: {
    type: String,
    required: true
  },

  placement: {
    type: Number,
    enum: [OptionPlacement.NONE, OptionPlacement.LEFT, OptionPlacement.RIGHT, OptionPlacement.WHOLE],
    required: true
  },

  qualifier: {
    type: Number,
    enum: [OptionQualifier.REGULAR, OptionQualifier.LITE, OptionQualifier.HEAVY, OptionQualifier.OTS],
    required: true
  }
}, { _id: false});