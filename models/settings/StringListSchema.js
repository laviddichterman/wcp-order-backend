const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// StringList works for ServicesList
var StringListSchema = new Schema({ services: [String] });

module.exports = StringListSchema;
