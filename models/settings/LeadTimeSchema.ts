import mongoose, { Schema } from "mongoose";
import path from 'path';

// NumberList works for LeadtimeList
export const LeadTimeSchema = new Schema({
  service: Number,
  lead: Number
}, { _id: false });

export default mongoose.model(path.basename(__filename).replace(path.extname(__filename), ''), LeadTimeSchema);

