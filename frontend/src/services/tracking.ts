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
 *
 * On the web this is still a browser tab, so the OS can freeze GPS updates
 * once the screen locks or the tab is backgrounded — no website can override
 * that. Inside the ACT To Go Android app (Capacitor), the same code instead
 * drives @capacitor-community/background-geolocation, which runs as a
 * foreground service and keeps sending updates with the screen off or a
 * different app open, as long as the trip hasn't been ended.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin, Location as BgLocation, CallbackError } from '@capacitor-community/background-geolocation';
import { CAMPUS_CENTER, CAMPUS_GEOFENCE_RADIUS_M } from '../constants';
import { logGeofenceEvent, writeBusLocation } from './firestore';
import type { LatLng } from '../types';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

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

const isNative = Capacitor.isNativePlatform();

let state: TrackingState = EMPTY_STATE;
let webWatchId: number | null = null;
let nativeWatcherId: string | null = null;
let wakeLock: any = null;
let lastWrite: { at: number; pos: LatLng } | null = null;
let wasInsideCampus: boolean | null = null; // null = unknown yet (no fix since trip start) — don't log a transition off that
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

// Wake Lock only matters on the web path — the native app stays alive via
// its own foreground service regardless of screen state.
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

if (typeof document !== 'undefined' && !isNative) {
  document.addEventListener('visibilitychange', () => {
    // The OS silently drops wake locks when the tab is hidden — re-acquire
    // the moment it's visible again, for whichever page happens to be open.
    if (document.visibilityState === 'visible' && webWatchId !== null) acquireWakeLock();
  });
}

// Logs "bus entered/left campus" the moment the geofence boundary is
// crossed — no manual entry, per PROJECT_SPEC.md section 4. Errors are
// swallowed: a missed log entry shouldn't interrupt GPS tracking.
const checkGeofence = (busId: string, pos: LatLng) => {
  const isInside = haversineMeters(pos, CAMPUS_CENTER) <= CAMPUS_GEOFENCE_RADIUS_M;
  if (wasInsideCampus !== null && wasInsideCampus !== isInside) {
    logGeofenceEvent(busId, isInside ? 'entry' : 'exit').catch(() => {});
  }
  wasInsideCampus = isInside;
};

const handleFix = (pos: LatLng, acc: number | null, spdKmh: number | null, heading: number | null) => {
  setState({ current: pos, accuracy: acc, speed: spdKmh, lastFix: new Date().toLocaleTimeString() });

  const busId = state.busId;
  if (!busId) return;

  checkGeofence(busId, pos);

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

export const isTrackingActive = (): boolean => webWatchId !== null || nativeWatcherId !== null;

export const getTrackingState = (): TrackingState => state;

export const subscribeTracking = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const startNativeTracking = async (): Promise<void> => {
  try {
    nativeWatcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'ACT To Go — trip in progress',
        backgroundMessage: 'Sharing your live location with students until you end the trip.',
        requestPermissions: true,
        stale: false,
        distanceFilter: MIN_MOVE_METERS,
      },
      (location?: BgLocation, error?: CallbackError) => {
        if (error) {
          console.warn('Background GPS error:', error);
          setState({ error: error.code === 'NOT_AUTHORIZED' ? 'Location permission denied.' : 'GPS signal lost.' });
          return;
        }
        if (!location) return;
        handleFix(
          { lat: location.latitude, lng: location.longitude },
          location.accuracy ?? null,
          location.speed != null ? location.speed * 3.6 : null, // m/s → km/h
          location.bearing ?? null
        );
      }
    );
  } catch (e) {
    console.error('Could not start background GPS:', e);
    setState({ error: 'Could not start location tracking — check location permission.' });
  }
};

const startWebTracking = (): void => {
  if (!navigator.geolocation) {
    setState({ error: 'GPS not available on this device.' });
    return;
  }
  acquireWakeLock();
  webWatchId = navigator.geolocation.watchPosition(
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

export const startTracking = (busId: string): void => {
  if (isTrackingActive()) return; // already running — survived a route change
  state = { ...EMPTY_STATE, busId };
  lastWrite = null;
  wasInsideCampus = null;

  if (isNative) startNativeTracking();
  else startWebTracking();
};

/** Stops the GPS watch and wake lock. Does NOT touch the Firestore claim —
 *  callers (End Trip / Logout) release the bus themselves. */
export const stopTracking = (): void => {
  if (webWatchId !== null) {
    navigator.geolocation.clearWatch(webWatchId);
    webWatchId = null;
  }
  if (nativeWatcherId !== null) {
    BackgroundGeolocation.removeWatcher({ id: nativeWatcherId }).catch(() => {});
    nativeWatcherId = null;
  }
  releaseWakeLock();
  state = EMPTY_STATE;
  lastWrite = null;
  listeners.forEach((l) => l());
};

/** Only meaningful on native — lets the driver jump to the app's location
 *  settings if a permission was permanently denied. */
export const openNativeLocationSettings = (): void => {
  if (isNative) BackgroundGeolocation.openSettings().catch(() => {});
};
