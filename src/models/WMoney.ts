import { IMoney, CURRENCY } from "@wcp/wcpshared";
import {Schema} from "mongoose";

// NOTE: this is a mix-in and probably won't be instantiated directly
export const WMoney = new Schema<IMoney>({
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    enum: CURRENCY,
    required: true
  }
}, { _id: false });
