const mongoose = require("mongoose");
const Schema = mongoose.Schema;

var SettingsSchema = new Schema({
  additional_pizza_lead_time: {
    type: Number,
    default: 5
  },
  time_step2: [{
    type: Number,
    default: 15
  }],
  pipeline_info: {
    baking_pipeline: [{ slots: Number, time: Number }],
    transfer_padding: Number
  },
  operating_hours: [[[[Number]]]]
});
module.exports = SettingsSchema;
