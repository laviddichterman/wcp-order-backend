import { Schema } from "mongoose";
import { MetricsDto } from "@wcp/wcpshared";

export const WMetricsSchema = new Schema<MetricsDto>({
    pageLoadTime: Number,
    pageLoadTimeLocal: Number,
    roughTicksSinceLoad: Number,
    numTimeBumps: Number,
    numTipAdjusts: Number,
    numTipFixed: Number,
    currentTime: Number,
    currentLocalTime: Number,
    timeToFirstProduct: Number,
    timeToServiceDate: Number,
    timeToServiceTime: Number,
    timeToStage: [Number],
    submitTime: Number,
    useragent: String
}, { _id: false });
