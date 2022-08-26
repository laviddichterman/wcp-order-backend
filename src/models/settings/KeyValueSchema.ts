import { KeyValue } from "@wcp/wcpshared";
import mongoose, {Schema} from "mongoose";
import path from 'path';

export const KeyValueEntrySchema = new Schema<KeyValue>({
  key: { 
    type: String, 
    required: true 
  },
  value: { 
    type: String,
    required: true 
  }
}, { _id: false });

export interface IKeyValueStore {
  settings: KeyValue[];
};

// generic bucket for authentication credentials
export const SettingsKeyValueSchema = new Schema<IKeyValueStore>({ 
  settings: [KeyValueEntrySchema]
 }, { _id: false });

export default mongoose.model<IKeyValueStore>(path.basename(__filename).replace(path.extname(__filename), ''), SettingsKeyValueSchema);