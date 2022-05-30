const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// StringList works for ServicesList
const StringListSchema = new Schema({ services: [String] }, { _id: false });

module.exports = StringListSchema;
