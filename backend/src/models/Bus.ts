/**
 * Bus Model — TypeScript + Mongoose
 */
import mongoose, { Document, Schema } from 'mongoose';
import { IBus } from '../types';

export interface IBusDocument extends Omit<Document, 'model'>, IBus {}

const busSchema = new Schema<IBusDocument>(
  {
    busId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    busNumber: {
      type: String,
      default: function (this: IBusDocument) {
        return this.busName || this.busId;
      },
    },
    capacity: {
      type: Number,
      default: 0,
      min: 0,
    },
    model: {
      type: String,
      default: '',
    },
    registrationPlate: {
      type: String,
      default: '',
    },
    busName: {
      type: String,
      default: 'Unknown Bus',
    },
    routeName: {
      type: String,
      default: 'General Route',
    },
    currentRoute: {
      type: String,
      default: '',
    },
    driverName: {
      type: String,
      default: 'Unknown Driver',
    },
    assignedDriver: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'maintenance'],
      default: 'inactive',
    },
    lastLocation: {
      latitude: { type: Number, default: 13.0827 },
      longitude: { type: Number, default: 80.2707 },
      accuracy: { type: Number, default: null },
      speed: { type: Number, default: null },
      timestamp: { type: Date, default: Date.now },
    },
    fcmTopicName: {
      type: String,
      default: function (this: IBusDocument) {
        return `bus-updates-${this.busId}`;
      },
    },
    driverPin: {
      type: String,
      default: '702f3780373f1505f013d96460980e12613b5ff28882fa8162235e5d32644265', // Default: 1234
    },
  },
  { timestamps: true }
);

// ✅ PRODUCTION INDEXES
busSchema.index({ busId: 1 });
busSchema.index({ busNumber: 1 });
busSchema.index({ isActive: 1 });
busSchema.index({ createdAt: -1 });

// Pre-save hook
busSchema.pre('save', function (this: IBusDocument, next) {
  if (!this.fcmTopicName) {
    this.fcmTopicName = `bus-updates-${this.busId}`;
  }
  if (!this.busNumber) {
    this.busNumber = this.busName || this.busId;
  }
  if (!this.currentRoute && this.routeName) {
    this.currentRoute = this.routeName;
  }
  if (!this.assignedDriver && this.driverName) {
    this.assignedDriver = this.driverName;
  }
  if (!this.status) {
    this.status = this.isActive ? 'active' : 'inactive';
  }
  if (this.status === 'active') {
    this.isActive = true;
  } else if (this.status === 'inactive') {
    this.isActive = false;
  }
  next();
});

export default mongoose.model<IBusDocument>('Bus', busSchema);
