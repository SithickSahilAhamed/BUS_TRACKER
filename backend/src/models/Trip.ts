/**
 * Trip Model — TypeScript + Mongoose
 */
import mongoose, { Document, Schema } from 'mongoose';
import { ITrip } from '../types';

export interface ITripDocument extends ITrip, Document {}

const tripSchema = new Schema<ITripDocument>(
  {
    busId: { type: String, required: true },
    routeId: { type: String, required: true },
    driverId: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, default: null },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
    distance: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    studentsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

tripSchema.index({ busId: 1, status: 1 });
tripSchema.index({ routeId: 1 });
tripSchema.index({ driverId: 1 });

export default mongoose.model<ITripDocument>('Trip', tripSchema);
