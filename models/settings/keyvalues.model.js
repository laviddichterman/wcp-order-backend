const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// generic bucket for authentication credentials
var KeyValueSchema = new Schema({ 
  settings: [{ 
    key: String, 
    value: String 
  }] });

module.exports = mongoose.model("KeyValueSchema", KeyValueSchema);
