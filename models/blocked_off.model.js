const mongoose = require('mongoose');
const Schema = mongoose.Schema;

var BlockedOffSchema = new Schema({
  blocked_off: [
    {
      service: Number,
      exclusion_date: String,
      // only hours and minutes of the interval dates matter
      excluded_intervals: [{start: Number, end: Number}]
    }
  ]
});
module.exports = mongoose.model('BlockedOffSchema', BlockedOffSchema);
