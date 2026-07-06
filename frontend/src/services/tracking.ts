/**
 * GPS tracking lives here, outside React, on purpose.
 *
 * Previously the watch/wake-lock lived in DriverPanel's own refs, so
 * navigating away from /driver (e.g. tapping "View map") unmounted the page,
 * which tore down the GPS watch — the driver had to come back and press
 * Resume. A module-level singleton survives route changes; only an explicit
 * endTracking() (End Trip / Logout) stops it. A real page reload still
 * resets it, since that clears all JS state — the Driver Panel's existing
 * "Resume" prompt (backed by the Firestore claim) covers that rare case.
 */

import { writeBusLocation } from './firestore';
import type { LatLng } from '../types';

const WRITE_INTERVAL_MS = 10_000;
const MIN_MOVE_METERS = 10;
const HEARTBEAT_MS = 30_000; // still write occasionally when stopped at a signal

export interface TrackingState {
  busId: string | null;
  current: LatLng | null;
  accuracy: number | null;
  speed: number | null;
  lastFix: string | null;
  writeCount: number;
  error: string | null;
}

type Listener = () => void;

const EMPTY_STATE: TrackingState = {
  busId: null,
  current: null,
  accuracy: null,
  speed: null,
  lastFix: null,
  writeCount: 0,
  error: null,
};

let state: TrackingState = EMPTY_STATE;
let watchId: number | null = null;
let wakeLock: any = null;
let lastWrite: { at: number; pos: LatLng } | null = null;
const listeners = new Set<Listener>();

const setState = (patch: Partial<TrackingState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

const haversineMeters = (a: LatLng, b: LatLng): number => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const acquireWakeLock = async () => {
  try {
    wakeLock = await (navigator as any).wakeLock?.request('screen');
  } catch {
    /* unsupported — the Driver Panel shows a "keep screen on" hint */
  }
};

const releaseWakeLock = () => {
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    // The OS silently drops wake locks when the tab is hidden — re-acquire
    // the moment it's visible again, for whichever page happens to be open.
    if (document.visibilityState === 'visible' && watchId !== null) acquireWakeLock();
  });
}

const handleFix = (pos: LatLng, acc: number | null, spdKmh: number | null, heading: number | null) => {
  setState({ current: pos, accuracy: acc, speed: spdKmh, lastFix: new Date().toLocaleTimeString() });

  const busId = state.busId;
  if (!busId) return;

  const now = Date.now();
  const last = lastWrite;
  const movedEnough = !last || haversineMeters(last.pos, pos) >= MIN_MOVE_METERS;
  const intervalOk = !last || now - last.at >= WRITE_INTERVAL_MS;
  const heartbeatDue = last && now - last.at >= HEARTBEAT_MS;

  if ((intervalOk && movedEnough) || heartbeatDue) {
    lastWrite = { at: now, pos };
    writeBusLocation(busId, { lat: pos.lat, lng: pos.lng, speedKmh: spdKmh, heading, accuracy: acc })
      .then(() => setState({ writeCount: state.writeCount + 1, error: null }))
      .catch((e) => {
        console.error('Location write failed:', e);
        setState({ error: 'Sending your location failed — check your internet connection.' });
      });
  }
};

export const isTrackingActive = (): boolean => watchId !== null;

export const getTrackingState = (): TrackingState => state;

export const subscribeTracking = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const startTracking = (busId: string): void => {
  if (watchId !== null) return; // already running — survived a route change
  state = { ...EMPTY_STATE, busId };
  lastWrite = null;
  acquireWakeLock();

  if (!navigator.geolocation) {
    setState({ error: 'GPS not available on this device.' });
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) =>
      handleFix(
        { lat: pos.coords.latitude, lng: pos.coords.longitude },
        pos.coords.accuracy ?? null,
        pos.coords.speed != null ? pos.coords.speed * 3.6 : null, // m/s → km/h
        pos.coords.heading ?? null
      ),
    (err) => {
      console.warn('GPS error:', err.message);
      setState({ error: 'GPS signal lost. Keep the phone near a window.' });
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
  );
};

/** Stops the GPS watch and wake lock. Does NOT touch the Firestore claim —
 *  callers (End Trip / Logout) release the bus themselves. */
export const stopTracking = (): void => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  releaseWakeLock();
  state = EMPTY_STATE;
  lastWrite = null;
  listeners.forEach((l) => l());
};
