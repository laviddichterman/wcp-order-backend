const mongoose = require('mongoose');
const Schema = mongoose.Schema;

var BlockedOffSchema = new Schema({
  blocked_off: [
    {
      service: Number,
      exclusion_date: Date,
      // only hours and minutes of the interval dates matter
      excluded_intervals: [{start: Date, end: Date}]
    }
  ]
});
module.exports = mongoose.model('BlockedOffSchema', BlockedOffSchema);
