/**
 * All Firestore access for the app.
 * Realtime data flows through onSnapshot subscriptions; writes are plain
 * document updates guarded by firestore.rules (see repo root).
 */

import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, firebaseConfig } from '../lib/firebase';
import type {
  Bus,
  BusInput,
  DriverReport,
  EntryExitLog,
  FuelRecord,
  GeofenceEvent,
  MaintenanceRecord,
  MissedBusRequest,
  ReportType,
  TripRecord,
  UserProfile,
  VehicleProfile,
} from '../types';

// ============================================================================
// BUSES
// ============================================================================

/** "bus 1" → "BUS-1" — doc IDs are the normalized bus number. */
export const normalizeBusId = (busNumber: string): string =>
  busNumber.trim().toUpperCase().replace(/\s+/g, '-');

export function subscribeToBuses(
  cb: (buses: Bus[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'buses'),
    (snap) => {
      const buses = snap.docs
        .map((d) => ({ busId: d.id, ...d.data() } as Bus))
        .sort((a, b) => a.busId.localeCompare(b.busId, undefined, { numeric: true }));
      cb(buses);
    },
    (err) => onError?.(err)
  );
}

/** Create a new bus. Trip fields are seeded explicitly — the security rules
 *  compare `activeDriverId` on every driver write, so it must always exist. */
export async function createBus(input: BusInput): Promise<string> {
  const busId = normalizeBusId(input.busNumber);
  await setDoc(doc(db, 'buses', busId), {
    busNumber: busId,
    busName: input.busName.trim(),
    routeName: input.routeName.trim(),
    origin: input.origin.trim(),
    destination: input.destination.trim(),
    waypoints: input.waypoints,
    routePath: input.routePath ?? null,
    stops: input.stops ?? null,
    capacity: input.capacity,
    isActive: false,
    activeDriverId: null,
    activeDriverName: null,
    tripStartedAt: null,
    lastLocation: null,
    boardedStudentIds: [],
    vehicleProfile: null,
    nextServiceDueDate: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return busId;
}

/** Update an existing bus's config without touching live trip state. */
export async function updateBus(busId: string, input: BusInput): Promise<void> {
  await updateDoc(doc(db, 'buses', busId), {
    busName: input.busName.trim(),
    routeName: input.routeName.trim(),
    origin: input.origin.trim(),
    destination: input.destination.trim(),
    waypoints: input.waypoints,
    routePath: input.routePath ?? null,
    stops: input.stops ?? null,
    capacity: input.capacity,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBus(busId: string): Promise<void> {
  await deleteDoc(doc(db, 'buses', busId));
}

// ============================================================================
// TRIPS (driver)
// ============================================================================

export async function claimBus(busId: string, driver: { uid: string; name: string }): Promise<void> {
  await updateDoc(doc(db, 'buses', busId), {
    isActive: true,
    activeDriverId: driver.uid,
    activeDriverName: driver.name,
    tripStartedAt: serverTimestamp(),
    lastLocation: null,
    boardedStudentIds: [],
    updatedAt: serverTimestamp(),
  });
}

/** Toggles one rider's boarded state for the current trip. Only the bus's
 *  current driver can call this (enforced by firestore.rules). */
export async function setStudentBoarded(busId: string, uid: string, boarded: boolean): Promise<void> {
  await updateDoc(doc(db, 'buses', busId), {
    boardedStudentIds: boarded ? arrayUnion(uid) : arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}

export async function releaseBus(busId: string): Promise<void> {
  await updateDoc(doc(db, 'buses', busId), {
    isActive: false,
    activeDriverId: null,
    activeDriverName: null,
    updatedAt: serverTimestamp(),
  });
}

export async function writeBusLocation(
  busId: string,
  loc: { lat: number; lng: number; speedKmh: number | null; heading: number | null; accuracy: number | null }
): Promise<void> {
  await updateDoc(doc(db, 'buses', busId), {
    lastLocation: { ...loc, updatedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
}

// ============================================================================
// DRIVERS (admin)
// ============================================================================

export function subscribeToDrivers(
  cb: (drivers: UserProfile[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users'), where('role', '==', 'driver')),
    (snap) => {
      const drivers = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() } as UserProfile))
        .sort((a, b) => a.name.localeCompare(b.name));
      cb(drivers);
    },
    (err) => onError?.(err)
  );
}

export async function setDriverActive(uid: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { active });
}

// ============================================================================
// MAINTENANCE TEAM (admin)
// ============================================================================

export function subscribeToMaintenanceStaff(
  cb: (staff: UserProfile[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users'), where('role', '==', 'maintenance')),
    (snap) => {
      const staff = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() } as UserProfile))
        .sort((a, b) => a.name.localeCompare(b.name));
      cb(staff);
    },
    (err) => onError?.(err)
  );
}

export async function setMaintenanceStaffActive(uid: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { active });
}

// ============================================================================
// STUDENTS (admin)
// ============================================================================

export function subscribeToStudents(
  cb: (students: UserProfile[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users'), where('role', 'in', ['student', 'professor'])),
    (snap) => {
      const students = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() } as UserProfile))
        .sort((a, b) => a.name.localeCompare(b.name));
      cb(students);
    },
    (err) => onError?.(err)
  );
}

/** Sets or clears a student/professor's permanent bus + boarding stop. */
export async function assignStudentStop(
  uid: string,
  assignment: { assignedBusId: string | null; assignedStopName: string | null }
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), assignment);
}

/**
 * Admin creates a driver or maintenance login without losing their own
 * session: a throw-away secondary Firebase app signs the new user up, then
 * the profile doc is written from the PRIMARY (admin) session so the
 * "admin creates staff" security rule applies.
 */
async function createStaffAccount(
  role: 'driver' | 'maintenance',
  input: { name: string; email: string; phone: string; password: string }
): Promise<string> {
  const secondary = initializeApp(firebaseConfig, `${role}-create-${Date.now()}`);
  let uid: string;
  try {
    const cred = await createUserWithEmailAndPassword(
      getAuth(secondary),
      input.email.trim(),
      input.password
    );
    uid = cred.user.uid;
    await signOut(getAuth(secondary));
  } finally {
    await deleteApp(secondary);
  }

  try {
    await setDoc(doc(db, 'users', uid), {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      role,
      active: true,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    throw new Error(
      `The login was created but saving the ${role} profile failed. ` +
        'Delete the user in Firebase console → Authentication and try again.'
    );
  }
  return uid;
}

export const createDriverAccount = (input: { name: string; email: string; phone: string; password: string }) =>
  createStaffAccount('driver', input);

export const createMaintenanceAccount = (input: { name: string; email: string; phone: string; password: string }) =>
  createStaffAccount('maintenance', input);

// ============================================================================
// DRIVER REPORTS (incident + damage)
// ============================================================================

export async function submitDriverReport(input: {
  type: ReportType;
  category: string;
  description: string;
  busId: string;
  busNumber: string;
  driverId: string;
  driverName: string;
}): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    type: input.type,
    category: input.category,
    description: input.description.trim() || null,
    busId: input.busId,
    busNumber: input.busNumber,
    driverId: input.driverId,
    driverName: input.driverName,
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

/** Admin-only — enforced by firestore.rules, not just the query. */
export function subscribeToReports(
  cb: (reports: DriverReport[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'reports'), orderBy('createdAt', 'desc')),
    (snap) => {
      const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DriverReport));
      cb(reports);
    },
    (err) => onError?.(err)
  );
}

export async function resolveReport(reportId: string, repairNotes?: string): Promise<void> {
  await updateDoc(doc(db, 'reports', reportId), {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
    ...(repairNotes?.trim() ? { repairNotes: repairNotes.trim() } : {}),
  });
}

/** Maintenance staff's worklist — PROJECT_SPEC.md section 5's "Repair
 *  Requests" reuses the driver's damage reports rather than a separate
 *  collection. Scoped by `where` so firestore.rules can allow it (they can't
 *  read incident reports, only damage ones). */
export function subscribeToDamageReports(
  cb: (reports: DriverReport[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'reports'), where('type', '==', 'damage')),
    (snap) => {
      const reports = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as DriverReport))
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      cb(reports);
    },
    (err) => onError?.(err)
  );
}

// ============================================================================
// MISSED BUS RECOVERY
// ============================================================================

export async function submitMissedBusRequest(input: {
  studentId: string;
  studentName: string;
  originalBusId: string;
  requestedBusId: string;
  requestedBusNumber: string;
}): Promise<void> {
  await addDoc(collection(db, 'missedBusRequests'), {
    ...input,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

/** Admin-only: this unfiltered query would be rejected by firestore.rules
 *  for anyone else — Firestore requires a `where` clause proving every
 *  possible result is readable, not just each doc's own rule to pass. */
export function subscribeToMissedBusRequests(
  cb: (requests: MissedBusRequest[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'missedBusRequests'), orderBy('createdAt', 'desc')),
    (snap) => {
      const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MissedBusRequest));
      cb(requests);
    },
    (err) => onError?.(err)
  );
}

/** A student's own requests — scoped by the `where` so the rules can allow it. */
export function subscribeToMyMissedBusRequests(
  studentId: string,
  cb: (requests: MissedBusRequest[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'missedBusRequests'), where('studentId', '==', studentId)),
    (snap) => {
      const requests = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as MissedBusRequest))
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      cb(requests);
    },
    (err) => onError?.(err)
  );
}

export async function resolveMissedBusRequest(id: string, status: 'approved' | 'denied'): Promise<void> {
  await updateDoc(doc(db, 'missedBusRequests', id), { status, resolvedAt: serverTimestamp() });
}

// ============================================================================
// ENTRY/EXIT LOG (campus geofence — see services/tracking.ts)
// ============================================================================

export async function logGeofenceEvent(busId: string, event: GeofenceEvent): Promise<void> {
  await addDoc(collection(db, 'entryExitLogs'), {
    busId,
    busNumber: busId,
    event,
    at: serverTimestamp(),
  });
}

/** Admin-only — enforced by firestore.rules. */
export function subscribeToEntryExitLogs(
  cb: (logs: EntryExitLog[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'entryExitLogs'), orderBy('at', 'desc')),
    (snap) => {
      const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as EntryExitLog));
      cb(logs);
    },
    (err) => onError?.(err)
  );
}

// ============================================================================
// BREAKDOWN MANAGEMENT
// ============================================================================

export interface AlternativeBus {
  bus: Bus;
  assignedRiders: number;
  availableSeats: number;
}

/** Buses other than `excludeBusId` with free seats, most-available first.
 *  "Assigned riders" (not live boarding count) is the occupancy proxy — it's
 *  the only per-bus headcount available for buses nobody is currently riding. */
export function suggestAlternativeBuses(
  excludeBusId: string,
  buses: Bus[],
  students: UserProfile[]
): AlternativeBus[] {
  return buses
    .filter((b) => b.busId !== excludeBusId)
    .map((bus) => {
      const assignedRiders = students.filter((s) => s.assignedBusId === bus.busId).length;
      return { bus, assignedRiders, availableSeats: Math.max(0, (bus.capacity || 0) - assignedRiders) };
    })
    .filter((b) => b.availableSeats > 0)
    .sort((a, b) => b.availableSeats - a.availableSeats);
}

/**
 * Moves every rider permanently assigned to `fromBusId` onto `toBusId`.
 * Their stop is cleared (the two buses' stop names rarely match) — admin
 * re-sets it per student afterward via the Students tab. "Students
 * automatically notified" (PROJECT_SPEC.md section 4) means their own My Bus
 * banner reflects the change next time they look; there's no push
 * notification system yet (that's Phase 6).
 */
export async function reallocateBusRiders(fromBusId: string, toBusId: string): Promise<number> {
  const snap = await getDocs(query(collection(db, 'users'), where('assignedBusId', '==', fromBusId)));
  if (snap.empty) return 0;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => {
    batch.update(d.ref, { assignedBusId: toBusId, assignedStopName: null });
  });
  await batch.commit();
  return snap.size;
}

// ============================================================================
// FLEET MAINTENANCE (PROJECT_SPEC.md section 5)
// ============================================================================

/** Admin-only field set (registration, documents, etc). */
export async function updateVehicleProfile(busId: string, profile: VehicleProfile): Promise<void> {
  await updateDoc(doc(db, 'buses', busId), { vehicleProfile: profile, updatedAt: serverTimestamp() });
}

/** Separate from updateVehicleProfile so maintenance staff can call this
 *  without needing write access to the rest of the profile (see firestore.rules). */
export async function setNextServiceDueDate(busId: string, date: Timestamp | null): Promise<void> {
  await updateDoc(doc(db, 'buses', busId), { nextServiceDueDate: date, updatedAt: serverTimestamp() });
}

export async function addFuelRecord(input: {
  busId: string;
  busNumber: string;
  date: Date;
  litres: number;
  cost: number;
  station: string;
  odometerKm: number | null;
}): Promise<void> {
  await addDoc(collection(db, 'fuelRecords'), {
    ...input,
    date: input.date,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToFuelRecords(
  busId: string,
  cb: (records: FuelRecord[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'fuelRecords'), where('busId', '==', busId)),
    (snap) => {
      const records = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as FuelRecord))
        .sort((a, b) => (b.date?.toMillis() ?? 0) - (a.date?.toMillis() ?? 0));
      cb(records);
    },
    (err) => onError?.(err)
  );
}

export async function addMaintenanceRecord(input: {
  busId: string;
  busNumber: string;
  category: string;
  description: string;
  cost: number | null;
  performedAt: Date;
}): Promise<void> {
  await addDoc(collection(db, 'maintenanceRecords'), {
    ...input,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToMaintenanceRecords(
  busId: string,
  cb: (records: MaintenanceRecord[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'maintenanceRecords'), where('busId', '==', busId)),
    (snap) => {
      const records = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as MaintenanceRecord))
        .sort((a, b) => (b.performedAt?.toMillis() ?? 0) - (a.performedAt?.toMillis() ?? 0));
      cb(records);
    },
    (err) => onError?.(err)
  );
}

// ============================================================================
// ANALYTICS (PROJECT_SPEC.md section 6 — fleet-wide, admin-only reads)
// ============================================================================

export async function logCompletedTrip(input: {
  busId: string;
  busNumber: string;
  routeName: string;
  driverId: string;
  driverName: string;
  startedAt: Timestamp;
}): Promise<void> {
  const endedAt = Timestamp.now();
  await addDoc(collection(db, 'trips'), {
    ...input,
    endedAt,
    durationMinutes: Math.max(0, Math.round((endedAt.toMillis() - input.startedAt.toMillis()) / 60000)),
  });
}

export function subscribeToTrips(
  cb: (trips: TripRecord[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'trips'), orderBy('endedAt', 'desc')),
    (snap) => {
      const trips = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TripRecord));
      cb(trips);
    },
    (err) => onError?.(err)
  );
}

/** Fleet-wide fuel records for Fuel/Route Analysis — admin's broad read
 *  access (see firestore.rules) covers an unscoped query, unlike the
 *  per-bus subscribeToFuelRecords used on the Fleet Maintenance tab. */
export function subscribeToAllFuelRecords(
  cb: (records: FuelRecord[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'fuelRecords'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FuelRecord))),
    (err) => onError?.(err)
  );
}
