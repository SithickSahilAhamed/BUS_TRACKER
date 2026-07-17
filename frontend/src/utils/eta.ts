/**
 * Client-only ETA estimate: current speed + remaining distance along the
 * bus's saved road route. There's no location-history collection and no
 * backend (Spark plan, no Cloud Functions — see services/geo.ts), so this
 * intentionally can't factor in traffic or historical travel time the way
 * PROJECT_SPEC.md's full AI ETA description does.
 */

import type { LatLng } from '../types';

const EARTH_RADIUS_KM = 6371;
const FALLBACK_SPEED_KMH = 20; // used when stopped/just started, so ETA isn't infinite
const MIN_MOVING_SPEED_KMH = 3;
const ARRIVING_THRESHOLD_KM = 0.15;
const PASSED_THRESHOLD_KM = -0.15;

const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

/** Nearest point to `point` on segment a→b, treating the segment as flat (fine at road-segment scale). */
function projectOntoSegment(point: LatLng, a: LatLng, b: LatLng): LatLng {
  const abLat = b.lat - a.lat;
  const abLng = b.lng - a.lng;
  const lenSq = abLat * abLat + abLng * abLng;
  if (lenSq === 0) return a;
  const t = ((point.lat - a.lat) * abLat + (point.lng - a.lng) * abLng) / lenSq;
  const clampedT = Math.max(0, Math.min(1, t));
  return { lat: a.lat + clampedT * abLat, lng: a.lng + clampedT * abLng };
}

/** Distance (km) from the start of `path` to the point on it nearest `target` — i.e. `target`'s progress along the route. */
export function progressAlongPath(path: LatLng[], target: LatLng): number {
  if (path.length < 2) return 0;

  let cumulative = 0;
  let best = { distFromStart: 0, perpDist: Infinity };

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const projected = projectOntoSegment(target, a, b);
    const perpDist = haversineKm(target, projected);
    if (perpDist < best.perpDist) {
      best = { distFromStart: cumulative + haversineKm(a, projected), perpDist };
    }
    cumulative += haversineKm(a, b);
  }

  return best.distFromStart;
}

export interface EtaResult {
  remainingKm: number;
  etaMinutes: number | null; // null only when status is 'passed'
  status: 'approaching' | 'arriving' | 'passed';
  approximate: boolean; // true when falling back to straight-line distance (no saved route)
}

export function estimateEta(
  busLocation: LatLng & { speedKmh: number | null },
  targetStop: LatLng,
  routePath: LatLng[] | null
): EtaResult {
  let remainingKm: number;
  let approximate: boolean;

  if (routePath && routePath.length > 1) {
    const busProgress = progressAlongPath(routePath, busLocation);
    const stopProgress = progressAlongPath(routePath, targetStop);
    remainingKm = stopProgress - busProgress;
    approximate = false;
  } else {
    remainingKm = haversineKm(busLocation, targetStop);
    approximate = true;
  }

  if (remainingKm < PASSED_THRESHOLD_KM) {
    return { remainingKm, etaMinutes: null, status: 'passed', approximate };
  }
  if (remainingKm <= ARRIVING_THRESHOLD_KM) {
    return { remainingKm: Math.max(remainingKm, 0), etaMinutes: 0, status: 'arriving', approximate };
  }

  const effectiveSpeedKmh =
    busLocation.speedKmh != null && busLocation.speedKmh > MIN_MOVING_SPEED_KMH
      ? busLocation.speedKmh
      : FALLBACK_SPEED_KMH;

  const etaMinutes = Math.round((remainingKm / effectiveSpeedKmh) * 60);
  return { remainingKm, etaMinutes, status: 'approaching', approximate };
}
