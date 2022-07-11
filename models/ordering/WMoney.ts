import {Schema} from "mongoose";

// NOTE: this is a mix-in and probably won't be instantiated directly
export const WMoney = new Schema({
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    enum: ['USD'],
    required: true
  }
});
