import mongoose, {Schema} from "mongoose";
import path from 'path';

export interface IKeyValueStore {
  settings: { key: string, value: string }[];
};

// generic bucket for authentication credentials
export const KeyValueSchema = new Schema<IKeyValueStore>({ 
  settings: [{ 
    key: String, 
    value: String 
  }] }, { _id: false });

export default mongoose.model<IKeyValueStore>(path.basename(__filename).replace(path.extname(__filename), ''), KeyValueSchema);