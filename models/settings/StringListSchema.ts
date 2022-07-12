import mongoose, { Schema } from "mongoose";
import path from 'path';

// StringList works for ServicesList
export const StringListSchema = new Schema<{services: string[]}>({ services: [String] }, { _id: false });

export default mongoose.model<{services: string[]}>(path.basename(__filename).replace(path.extname(__filename), ''), StringListSchema);
