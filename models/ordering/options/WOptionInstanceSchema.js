const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WOptionInstanceSchema = new Schema({
  option_id: {
    type: String,
    required: true
  },

  placement: {
    type: String,
    enum: ['NONE', 'LEFT', 'RIGHT', 'WHOLE'],
    required: true
  }
}, { _id: false});

module.exports = WOptionInstanceSchema;
