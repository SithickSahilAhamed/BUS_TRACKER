/**
 * Location History Model — TypeScript + Mongoose
 * Auto-deletes records older than 30 days (TTL index)
 */
import mongoose, { Document, Schema } from 'mongoose';
import { ILocation } from '../types';

export interface ILocationDocument extends ILocation, Document {}

const locationSchema = new Schema<ILocationDocument>(
  {
    busId: { type: String, required: true, index: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number, default: null },
    speed: { type: Number, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

// ✅ PRODUCTION INDEXES
locationSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 }); // TTL: 30 days
locationSchema.index({ busId: 1, timestamp: -1 }); // Composite index for queries
locationSchema.index({ busId: 1 }); // Individual index for bulk queries

export default mongoose.model<ILocationDocument>('Location', locationSchema);
