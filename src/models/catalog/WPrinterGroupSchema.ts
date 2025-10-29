import path from 'path';
import mongoose, { Schema } from 'mongoose';
import { PrinterGroup } from '@wcp/wario-shared';
import { KeyValueEntrySchema } from '../settings/KeyValueSchema';

type MT = Omit<PrinterGroup, "id">;
export const PrinterGroupSchema = new Schema<MT>({
  name: { type: String, required: true },
  singleItemPerTicket: { 
    type: Boolean,
    required: true
  },
  isExpo: { 
    type: Boolean,
    required: true
  },
  externalIDs: {
    type: [KeyValueEntrySchema],
    required: true
  }
}, {id: true, toJSON: {virtuals: true}, toObject: { virtuals: true}});

export const PrinterGroupModel = mongoose.model<PrinterGroup>(path.basename(__filename).replace(path.extname(__filename), ''), PrinterGroupSchema);
