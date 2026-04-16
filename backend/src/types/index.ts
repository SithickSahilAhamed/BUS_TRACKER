// ============================================
// BACKEND TYPES — Shared TypeScript Interfaces
// ============================================

export interface BusLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  timestamp: Date;
}

export interface IBus {
  busId: string;
  busName: string;
  routeName: string;
  driverName: string;
  isActive: boolean;
  busNumber?: string;
  capacity?: number;
  model?: string;
  registrationPlate?: string;
  currentRoute?: string;
  assignedDriver?: string;
  status?: 'active' | 'inactive' | 'maintenance';
  lastLocation: BusLocation;
  fcmTopicName: string;
  driverPin?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILocation {
  busId: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  timestamp: Date;
}

export interface IWaypoint {
  name: string;
  latitude: number;
  longitude: number;
  stopNumber: number;
  stopType: 'pickup' | 'dropoff' | 'intermediate';
}

export interface IRoute {
  name: string;
  origin: string;
  destination: string;
  waypoints: IWaypoint[];
  estimatedDuration: number;
  distance: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDriver {
  userId: string;
  name: string;
  phoneNumber: string;
  licenseNumber: string;
  assignedBus?: string;
  status: 'active' | 'inactive' | 'on-leave';
  rating?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITrip {
  busId: string;
  routeId: string;
  driverId: string;
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'completed' | 'cancelled';
  distance?: number;
  duration?: number;
  studentsCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUser {
  firebaseUid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'driver' | 'student';
  busId?: string; // only for drivers
  fcmToken?: string;
  createdAt: Date;
}

export interface LocationUpdatePayload {
  busId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
}

export interface AuthenticatedRequest extends Express.Request {
  user?: {
    uid: string;
    email: string;
    role?: string;
  };
}

// Re-declare to allow augmentation
import 'express';
declare module 'express' {
  interface Request {
    user?: {
      uid: string;
      email: string;
      role: string;
    };
  }
}
