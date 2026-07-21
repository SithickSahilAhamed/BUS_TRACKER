import type { Timestamp } from 'firebase/firestore';

// ============================================================================
// USERS
// ============================================================================

// 'professor' is this college's own addition (staff also ride buses).
// 'maintenance', 'parent', and 'principal' all have real sign-up (admin-
// created, like 'driver') + dashboards as of Phase 6 — the schema is now
// fully realized for all 6 spec roles.
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
  linkedStudentUid?: string | null; // parent role only — the child they track, set by admin
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

// PROJECT_SPEC.md section 5 — admin-editable only (see nextServiceDueDate
// above for the one profile-ish field maintenance staff can also set).
export interface VehicleProfile {
  model: string | null;
  manufacturer: string | null;
  registrationNumber: string | null;
  engineNumber: string | null;
  chassisNumber: string | null;
  insuranceExpiry: Timestamp | null;
  permitExpiry: Timestamp | null;
  fcExpiry: Timestamp | null; // Fitness Certificate
  pucExpiry: Timestamp | null; // Pollution Under Control certificate
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
  capacity: number; // 0 on buses created before this field existed — admin should set it
  isActive: boolean;
  activeDriverId: string | null;
  activeDriverName: string | null;
  tripStartedAt: Timestamp | null;
  lastLocation: BusLocation | null;
  boardedStudentIds: string[]; // uids marked boarded this trip; reset when a driver claims the bus
  vehicleProfile: VehicleProfile | null;
  nextServiceDueDate: Timestamp | null; // separate top-level field (not in vehicleProfile) so firestore.rules can let maintenance staff set just this
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
  capacity: number;
  routePath?: LatLng[] | null;
  stops?: BusStop[] | null;
}

// ============================================================================
// DRIVER REPORTS (incident + damage — PROJECT_SPEC.md section 3)
// ============================================================================

export const INCIDENT_CATEGORIES = ['Accident', 'Breakdown', 'Flat Tyre', 'Heavy Traffic', 'Medical Emergency'] as const;
export const DAMAGE_CATEGORIES = ['Broken Window', 'Seat Damage', 'Brake Problem', 'Tyre Problem'] as const;

export type ReportType = 'incident' | 'damage';
export type ReportStatus = 'open' | 'resolved';

export interface DriverReport {
  id: string; // doc ID
  type: ReportType;
  category: string;
  description: string | null;
  busId: string;
  busNumber: string;
  driverId: string;
  driverName: string;
  status: ReportStatus;
  createdAt: Timestamp;
  resolvedAt?: Timestamp | null;
  // Set when a 'damage' report is closed out as a repair (section 5's
  // "Repair Requests" — reuses the driver's damage report rather than a
  // separate collection, since "driver submits, maintenance closes" is the
  // same lifecycle already built in Phase 2).
  repairNotes?: string | null;
}

// ============================================================================
// MISSED BUS RECOVERY (PROJECT_SPEC.md sections 2 + 4)
// ============================================================================

export type MissedBusStatus = 'pending' | 'approved' | 'denied';

export interface MissedBusRequest {
  id: string; // doc ID
  studentId: string;
  studentName: string;
  originalBusId: string;
  requestedBusId: string;
  requestedBusNumber: string;
  status: MissedBusStatus;
  createdAt: Timestamp;
  resolvedAt?: Timestamp | null;
}

// ============================================================================
// ENTRY/EXIT LOG (PROJECT_SPEC.md section 4 — campus geofence)
// ============================================================================

export type GeofenceEvent = 'entry' | 'exit';

export interface EntryExitLog {
  id: string; // doc ID
  busId: string;
  busNumber: string;
  event: GeofenceEvent;
  at: Timestamp;
}

// ============================================================================
// FLEET MAINTENANCE (PROJECT_SPEC.md section 5)
// ============================================================================

export interface FuelRecord {
  id: string; // doc ID
  busId: string;
  busNumber: string;
  date: Timestamp; // when fueled — admin-entered, may not equal createdAt
  litres: number;
  cost: number;
  station: string;
  odometerKm: number | null;
  createdAt: Timestamp;
}

export const MAINTENANCE_CATEGORIES = [
  'Tyres', 'Battery', 'Brake', 'Engine', 'Suspension', 'Oil', 'Service', 'Repair',
] as const;

export interface MaintenanceRecord {
  id: string; // doc ID
  busId: string;
  busNumber: string;
  category: string;
  description: string;
  cost: number | null;
  performedAt: Timestamp;
  createdAt: Timestamp;
}

// ============================================================================
// TRIP HISTORY (PROJECT_SPEC.md section 6 — Driver/Route Analysis)
// ============================================================================

// Logged once, at End Trip. No GPS trail (see services/tracking.ts's
// comments on write-quota) — just enough to answer "how long" and "how
// many trips," which is what's honestly derivable without a location
// history collection or real sensor data (speed/harsh-braking would need
// one of those; PROJECT_SPEC.md's own Driver Analysis fields for those are
// not implemented here — see CLAUDE.md).
export interface TripRecord {
  id: string; // doc ID
  busId: string;
  busNumber: string;
  routeName: string;
  driverId: string;
  driverName: string;
  startedAt: Timestamp;
  endedAt: Timestamp;
  durationMinutes: number;
}

// ============================================================================
// EMERGENCY SOS (PROJECT_SPEC.md sections 2 + 3 — student/driver "presses SOS")
// ============================================================================

export interface SosAlert {
  id: string; // doc ID
  userId: string;
  userName: string;
  role: 'student' | 'professor' | 'driver';
  busId: string | null;
  location: LatLng | null;
  createdAt: Timestamp;
  resolved: boolean;
  resolvedAt?: Timestamp | null;
}

// ============================================================================
// NOTIFICATIONS (PROJECT_SPEC.md section 7 — in-app, not push; see CLAUDE.md)
// ============================================================================

export type NotificationType =
  | 'sos' | 'incident' | 'damage' | 'repair_closed'
  | 'missed_bus_request' | 'missed_bus_decision' | 'bus_assignment';

export interface AppNotification {
  id: string; // doc ID
  // Exactly one of these is set: a specific person, or everyone with that role.
  recipientUid: string | null;
  recipientRole: UserRole | null;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: Timestamp;
}

// ============================================================================
// UI HELPERS
// ============================================================================

export interface SelectOption {
  value: string | number;
  label: string;
}
