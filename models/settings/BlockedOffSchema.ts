import mongoose from "mongoose";
const Schema = mongoose.Schema;

const StartEndObjectSchema = new Schema({start: Number, end: Number}, { _id: false});
export const SingleBlockOffSchema = new Schema({
  service: Number,
  exclusion_date: String,
  excluded_intervals: [StartEndObjectSchema]
}, {_id: false});
const BlockedOffSchema = new Schema({
  blocked_off: [SingleBlockOffSchema]
});

module.exports = SingleBlockOffSchema;