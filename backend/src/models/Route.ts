/**
 * Route Model — TypeScript + Mongoose
 */
import mongoose, { Document, Schema } from 'mongoose';
import { IRoute, IWaypoint } from '../types';

export interface IRouteDocument extends IRoute, Document {}

const waypointSchema = new Schema<IWaypoint>(
  {
    name: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    stopNumber: { type: Number, required: true },
    stopType: {
      type: String,
      enum: ['pickup', 'dropoff', 'intermediate'],
      default: 'intermediate',
    },
  },
  { _id: false }
);

const routeSchema = new Schema<IRouteDocument>(
  {
    name: { type: String, required: true },
    origin: { type: String, default: '' },
    destination: { type: String, default: '' },
    waypoints: { type: [waypointSchema], default: [] },
    estimatedDuration: { type: Number, default: 0 },
    distance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

routeSchema.index({ name: 1 });
routeSchema.index({ isActive: 1 });

export default mongoose.model<IRouteDocument>('Route', routeSchema);
