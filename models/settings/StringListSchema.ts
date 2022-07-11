import { Schema } from "mongoose";

// StringList works for ServicesList
export const StringListSchema = new Schema({ services: [String] }, { _id: false });

module.exports = StringListSchema;
