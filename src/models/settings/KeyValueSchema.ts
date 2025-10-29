import { KeyValue } from "@wcp/wario-shared";
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
  settings: {
    type: [KeyValueEntrySchema],
    required: true
  }
 }, { _id: false });

export const KeyValueModel = mongoose.model<IKeyValueStore>(path.basename(__filename).replace(path.extname(__filename), ''), SettingsKeyValueSchema);