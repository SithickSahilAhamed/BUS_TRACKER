import type { Timestamp } from 'firebase/firestore';

// ============================================================================
// USERS
// ============================================================================

// 'professor' is this college's own addition (staff also ride buses).
// 'parent' | 'maintenance' | 'principal' round the set out to the 6 roles in
// PROJECT_SPEC.md section 1 — modeled now so the schema doesn't change again,
// but there's no sign-up path or dashboard for them until their phases land.
export type UserRole = 'student' | 'professor' | 'driver' | 'admin' | 'parent' | 'maintenance' | 'principal';

export interface UserProfile {
  uid: string; // doc ID = Firebase Auth UID
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  assignedBusId?: string | null; // student/professor's permanent bus, set by admin
  assignedStopName?: string | null; // must match a name in that bus's `stops[]`
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
