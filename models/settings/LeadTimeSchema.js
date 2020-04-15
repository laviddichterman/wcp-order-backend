const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// NumberList works for LeadtimeList
var LeadTimeSchema = new Schema({
  service: Number,
  lead: Number
});

module.exports = LeadTimeSchema;
