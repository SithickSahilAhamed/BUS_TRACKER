import type { Timestamp } from 'firebase/firestore';

// ============================================================================
// USERS
// ============================================================================

export type UserRole = 'student' | 'professor' | 'driver' | 'admin';

export interface UserProfile {
  uid: string; // doc ID = Firebase Auth UID
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  createdAt?: Timestamp;
}

// ============================================================================
// BUSES
// ============================================================================

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BusStop extends LatLng {
  name: string;
}

export interface BusLocation extends LatLng {
  speedKmh: number | null;
  heading: number | null;
  accuracy: number | null;
  updatedAt: Timestamp | null; // serverTimestamp resolves to null locally for a moment
}

export interface Bus {
  busId: string; // doc ID, normalized bus number e.g. "BUS-1"
  busNumber: string;
  busName: string;
  routeName: string;
  origin: string;
  destination: string;
  waypoints: string[];
  routePath: LatLng[] | null; // OSRM polyline, computed at admin save time
  stops: BusStop[] | null; // geocoded origin/waypoints/destination
  isActive: boolean;
  activeDriverId: string | null;
  activeDriverName: string | null;
  tripStartedAt: Timestamp | null;
  lastLocation: BusLocation | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Admin form input for creating/editing a bus
export interface BusInput {
  busNumber: string;
  busName: string;
  routeName: string;
  origin: string;
  destination: string;
  waypoints: string[];
  routePath?: LatLng[] | null;
  stops?: BusStop[] | null;
}

// ============================================================================
// UI HELPERS
// ============================================================================

export interface SelectOption {
  value: string | number;
  label: string;
}
