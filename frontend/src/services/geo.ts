/**
 * Free, key-less geo services:
 *  - Nominatim (OpenStreetMap) for geocoding place names → coordinates
 *  - OSRM public server for road routes between stops
 *
 * Both are best-effort community servers, so they are only called from the
 * admin dashboard when a bus is saved — never from the live map.
 */

import type { BusStop, LatLng } from '../types';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Geocode a single place name. Returns null when nothing matches. */
export async function geocodePlace(place: string): Promise<LatLng | null> {
  const params = new URLSearchParams({
    q: place,
    format: 'json',
    limit: '1',
    countrycodes: 'in', // campus buses — bias results to India
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const results: Array<{ lat: string; lon: string }> = await res.json();
  if (!results.length) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

/** Road route through the given points, in order. */
export async function fetchRoute(points: LatLng[]): Promise<LatLng[]> {
  if (points.length < 2) return [];
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const res = await fetch(`${OSRM_URL}/${coords}?overview=full&geometries=geojson`);
  if (!res.ok) throw new Error(`Route lookup failed (${res.status})`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('No road route found between these places');
  }
  const path: LatLng[] = data.routes[0].geometry.coordinates.map(
    ([lng, lat]: [number, number]) => ({ lat, lng })
  );
  // Keep the Firestore doc small — ~1000 points is plenty for drawing
  if (path.length > 1000) {
    const step = Math.ceil(path.length / 1000);
    return path.filter((_, i) => i % step === 0 || i === path.length - 1);
  }
  return path;
}

export interface BuiltRoute {
  stops: BusStop[];
  routePath: LatLng[];
}

/**
 * Geocode origin → waypoints → destination (respecting Nominatim's
 * 1 request/second policy) and fetch the road route through them.
 * Throws with a readable message naming any place that couldn't be found.
 */
export async function buildRoute(
  origin: string,
  destination: string,
  waypoints: string[]
): Promise<BuiltRoute> {
  const names = [origin, ...waypoints, destination].map((n) => n.trim()).filter(Boolean);
  const stops: BusStop[] = [];
  const misses: string[] = [];

  for (let i = 0; i < names.length; i++) {
    if (i > 0) await sleep(1100); // Nominatim usage policy: max 1 req/sec
    const coords = await geocodePlace(names[i]);
    if (coords) {
      stops.push({ name: names[i], ...coords });
    } else {
      misses.push(names[i]);
    }
  }

  if (misses.length) {
    throw new Error(
      `Could not find on the map: ${misses.join(', ')}. Try adding the city, e.g. "Navalur, Chennai".`
    );
  }

  const routePath = await fetchRoute(stops);
  return { stops, routePath };
}
