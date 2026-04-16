/**
 * User Model — TypeScript + Mongoose
 * Stores driver and admin accounts linked to Firebase Auth
 */
import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from '../types';

export interface IUserDocument extends IUser, Document {}

const userSchema = new Schema<IUserDocument>(
  {
    firebaseUid: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    displayName: { type: String, default: '' },
    role: {
      type: String,
      enum: ['admin', 'driver', 'student'],
      required: true,
    },
    busId: { type: String, default: null }, // only for drivers
    fcmToken: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model<IUserDocument>('User', userSchema);
