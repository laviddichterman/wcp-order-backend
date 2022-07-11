import {Schema} from "mongoose";

// generic bucket for authentication credentials
export const KeyValueSchema = new Schema({ 
  settings: [{ 
    key: String, 
    value: String 
  }] }, { _id: false });

module.exports = KeyValueSchema;