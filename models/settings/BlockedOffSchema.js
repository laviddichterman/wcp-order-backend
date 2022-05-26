const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StartEndObjectSchema = new Schema({start: Number, end: Number}, { _id: false})
const BlockedOffSchema = new Schema({
  blocked_off: [
    {
      service: Number,
      exclusion_date: String,
      excluded_intervals: [StartEndObjectSchema]
    }
  ]
});
module.exports = BlockedOffSchema;
