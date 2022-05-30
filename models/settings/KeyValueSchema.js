const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// generic bucket for authentication credentials
const KeyValueSchema = new Schema({ 
  settings: [{ 
    key: String, 
    value: String 
  }] }, { _id: false });

module.exports = KeyValueSchema;
