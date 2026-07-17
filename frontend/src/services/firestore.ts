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
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, firebaseConfig } from '../lib/firebase';
import type { Bus, BusInput, DriverReport, ReportType, UserProfile } from '../types';

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
