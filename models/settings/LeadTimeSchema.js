const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// NumberList works for LeadtimeList
const LeadTimeSchema = new Schema({
  service: Number,
  lead: Number
}, { _id: false });

module.exports = LeadTimeSchema;
