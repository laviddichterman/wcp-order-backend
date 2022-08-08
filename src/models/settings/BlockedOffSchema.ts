import { IWBlockedOff, IWInterval } from "@wcp/wcpshared";
import mongoose, {Schema} from "mongoose";
import path from 'path';

export const IntervalSchema = new Schema<IWInterval>({
  start: { type: Number, required: true },
  end: { type: Number, required: true },
}, { _id: false });
export const SingleBlockOffSchema = new Schema({
  service: Number,
  exclusion_date: String,
  excluded_intervals: [IntervalSchema]
}, {_id: false});
const BlockedOffSchema = new Schema<IWBlockedOff>({
  blocked_off: [SingleBlockOffSchema]
});

export default mongoose.model<IWBlockedOff>(path.basename(__filename).replace(path.extname(__filename), ''), BlockedOffSchema);