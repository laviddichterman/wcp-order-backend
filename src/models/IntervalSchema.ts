import { IWInterval } from "@wcp/wcpshared";
import {Schema} from "mongoose";

export const IntervalSchema = new Schema<IWInterval>({
  start: { type: Number, required: true },
  end: { type: Number, required: true },
}, { _id: false });