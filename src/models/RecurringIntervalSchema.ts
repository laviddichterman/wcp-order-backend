import { IRecurringInterval } from "@wcp/wario-shared";
import {Schema} from "mongoose";
import { IntervalSchema } from "./IntervalSchema";

export const RecurringIntervalSchema = new Schema<IRecurringInterval>({
  interval: IntervalSchema,
  rrule: String
}, { _id: false });