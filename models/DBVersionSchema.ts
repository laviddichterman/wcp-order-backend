import mongoose from "mongoose";
const Schema = mongoose.Schema;

export const DBVersionSchema = new Schema({ major: Number, minor: Number, patch: Number });

export const DBVersionModel = mongoose.model(__filename, DBVersionSchema);
module.exports = DBVersionSchema;
