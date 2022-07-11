import { Schema } from "mongoose";

// NumberList works for LeadtimeList
export const LeadTimeSchema = new Schema({
  service: Number,
  lead: Number
}, { _id: false });

module.exports = LeadTimeSchema;
