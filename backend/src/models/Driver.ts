/**
 * Driver Model — TypeScript + Mongoose
 */
import mongoose, { Document, Schema } from 'mongoose';
import { IDriver } from '../types';

export interface IDriverDocument extends IDriver, Document {}

const driverSchema = new Schema<IDriverDocument>(
  {
    userId: { type: String, default: '' },
    name: { type: String, required: true },
    phoneNumber: { type: String, default: '' },
    licenseNumber: { type: String, default: '' },
    assignedBus: { type: String, default: '' },
    status: {
      type: String,
      enum: ['active', 'inactive', 'on-leave'],
      default: 'active',
    },
    rating: { type: Number, default: 0 },
  },
  { timestamps: true }
);

driverSchema.index({ userId: 1 });
driverSchema.index({ assignedBus: 1 });

driverSchema.index({ status: 1 });

export default mongoose.model<IDriverDocument>('Driver', driverSchema);
