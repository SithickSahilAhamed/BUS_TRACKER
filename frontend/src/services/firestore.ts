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
  GeofenceEvent,
  MissedBusRequest,
  ReportType,
  UserProfile,
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
 * Admin creates a driver login without losing their own session:
 * a throw-away secondary Firebase app signs the new user up, then the
 * profile doc is written from the PRIMARY (admin) session so the
 * "admin creates driver" security rule applies.
 */
export async function createDriverAccount(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<string> {
  const secondary = initializeApp(firebaseConfig, `driver-create-${Date.now()}`);
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
      role: 'driver',
      active: true,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    throw new Error(
      'The login was created but saving the driver profile failed. ' +
        'Delete the user in Firebase console → Authentication and try again.'
    );
  }
  return uid;
}

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

export async function resolveReport(reportId: string): Promise<void> {
  await updateDoc(doc(db, 'reports', reportId), {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
  });
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
