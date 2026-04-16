/**
 * STUDENT MAP — Agni College of Technology Bus Tracker
 * Full-screen Google Maps with real-time bus tracking via Socket.IO
 * Directions API renders the actual road route
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  DirectionsRenderer,
  InfoWindow,
} from '@react-google-maps/api';
import SocketService from '../services/socket';
import ApiService from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
const AGNI_CENTER = { lat: 12.8474, lng: 80.2026 }; // Agni College of Technology
const LIBRARIES: ('places' | 'geometry')[] = ['places', 'geometry'];

const MAP_OPTIONS: google.maps.MapOptions = {
  mapTypeControl: false,
  fullscreenControl: false,
  streetViewControl: false,
  zoomControl: true,
  zoomControlOptions: { position: 9 }, // RIGHT_CENTER
  gestureHandling: 'greedy',
  styles: [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit.station', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f8c967' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9e4f0' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f5f5f0' }] },
  ],
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface BusData {
  busId: string;
  busName: string;
  routeName: string;
  driverName: string;
  origin: string;
  destination: string;
  waypoints: string[];
  isActive: boolean;
  lastLocation?: { latitude: number; longitude: number; timestamp: string };
}

interface LiveLocation {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  heading: number | null;
  timestamp: Date;
}

// ─── SVG Bus Icon (inline — no external image dependency) ────────────────────

const BUS_SVG = (active: boolean) => ({
  url:
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <circle cx="22" cy="22" r="20" fill="${active ? '#0f5d8f' : '#1b7a5a'}" opacity="0.18"/>
  <circle cx="22" cy="22" r="14" fill="${active ? '#0f5d8f' : '#1b7a5a'}"/>
  <text x="22" y="27" text-anchor="middle" font-size="14" font-family="sans-serif" fill="white">🚌</text>
</svg>`),
  scaledSize: new google.maps.Size(44, 44),
  anchor: new google.maps.Point(22, 22),
});

// ─── Component ────────────────────────────────────────────────────────────────

export const StudentMapPage: React.FC = () => {
  const navigate = useNavigate();

  // Maps loading — useJsApiLoader is the correct hook (not LoadScript)
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const dirServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const markerAnimRef = useRef<{ [busId: string]: { from: google.maps.LatLng; to: google.maps.LatLng; start: number } }>({});

  const [buses, setBuses] = useState<BusData[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [liveLocations, setLiveLocations] = useState<Map<string, LiveLocation>>(new Map());
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [infoWindowId, setInfoWindowId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // ── Smooth animation helper ────────────────────────────────────────────────
  const animateMarker = useCallback(
    (busId: string, from: google.maps.LatLng, to: google.maps.LatLng) => {
      markerAnimRef.current[busId] = { from, to, start: performance.now() };
      const DURATION = 1200;

      const step = (now: number) => {
        const anim = markerAnimRef.current[busId];
        if (!anim) return;
        const t = Math.min((now - anim.start) / DURATION, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const lat = anim.from.lat() + (anim.to.lat() - anim.from.lat()) * ease;
        const lng = anim.from.lng() + (anim.to.lng() - anim.from.lng()) * ease;

        setLiveLocations((prev) => {
          const cur = prev.get(busId);
          if (!cur) return prev;
          const next = new Map(prev);
          next.set(busId, { ...cur, lat, lng });
          return next;
        });

        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    []
  );

  // ── Load buses ─────────────────────────────────────────────────────────────
  useEffect(() => {
    ApiService.getBuses()
      .then((res) => {
        const list: BusData[] = (res.data as any[] || []).map((b: any) => ({
          busId: b.busId || b.id,
          busName: b.busName || b.busNumber || b.busId,
          routeName: b.routeName || '',
          driverName: b.driverName || '',
          origin: b.origin || '',
          destination: b.destination || '',
          waypoints: Array.isArray(b.waypoints) ? b.waypoints : [],
          isActive: !!b.isActive,
          lastLocation: b.lastLocation,
        }));
        setBuses(list);

        // Seed known locations from DB
        const seedMap = new Map<string, LiveLocation>();
        list.forEach((b) => {
          if (b.lastLocation) {
            seedMap.set(b.busId, {
              lat: b.lastLocation.latitude,
              lng: b.lastLocation.longitude,
              speed: null,
              accuracy: null,
              heading: null,
              timestamp: new Date(b.lastLocation.timestamp),
            });
          }
        });
        if (seedMap.size) setLiveLocations(seedMap);
      })
      .catch(() => setMapError('Could not load buses. Check server connection.'));
  }, []);

  // ── Socket connection ──────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('authToken') || '';
    SocketService.connect(token)
      .then(() => setIsConnected(true))
      .catch(() => setIsConnected(false));

    return () => { SocketService.disconnect(); };
  }, []);

  useEffect(() => {
    const onStatus = (s: { isConnected: boolean }) => setIsConnected(s.isConnected);

    const onLocation = (data: any) => {
      if (!data?.busId || data.latitude == null || data.longitude == null) return;

      setLastUpdate(new Date());
      setLiveLocations((prev) => {
        const cur = prev.get(data.busId);
        const newPos = new google.maps.LatLng(data.latitude, data.longitude);

        if (cur && isLoaded) {
          const oldPos = new google.maps.LatLng(cur.lat, cur.lng);
          animateMarker(data.busId, oldPos, newPos);
        }

        const next = new Map(prev);
        next.set(data.busId, {
          lat: data.latitude,
          lng: data.longitude,
          speed: data.speed ?? null,
          accuracy: data.accuracy ?? null,
          heading: data.heading ?? null,
          timestamp: new Date(data.timestamp || Date.now()),
        });
        return next;
      });

      // Pan map if this is the selected bus
      if (data.busId === selectedId && mapRef.current) {
        mapRef.current.panTo({ lat: data.latitude, lng: data.longitude });
      }
    };

    const onBusStatus = (data: any) => {
      if (!data?.busId) return;
      setBuses((prev) =>
        prev.map((b) =>
          b.busId === data.busId ? { ...b, isActive: data.status === 'online' } : b
        )
      );
    };

    SocketService.on('connection-status', onStatus);
    SocketService.on('location-update', onLocation);
    SocketService.on('bus-status-change', onBusStatus);

    return () => {
      SocketService.off('connection-status', onStatus);
      SocketService.off('location-update', onLocation);
      SocketService.off('bus-status-change', onBusStatus);
    };
  }, [selectedId, isLoaded, animateMarker]);

  // ── On map load ────────────────────────────────────────────────────────────
  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    dirServiceRef.current = new google.maps.DirectionsService();
  }, []);

  // ── Fetch route directions ─────────────────────────────────────────────────
  const fetchDirections = useCallback((bus: BusData) => {
    if (!dirServiceRef.current || !bus.origin || !bus.destination) {
      setDirections(null);
      return;
    }

    setLoadingRoute(true);
    setRouteError(null);

    const waypoints: google.maps.DirectionsWaypoint[] = bus.waypoints.map((w) => ({
      location: w,
      stopover: true,
    }));

    dirServiceRef.current.route(
      {
        origin: bus.origin,
        destination: bus.destination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        setLoadingRoute(false);
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
          if (mapRef.current && result.routes[0]?.bounds) {
            mapRef.current.fitBounds(result.routes[0].bounds, { top: 80, bottom: 80, left: 360, right: 80 });
          }
        } else {
          setDirections(null);
          setRouteError('Route unavailable — showing live position only');
        }
      }
    );
  }, []);

  // ── Select bus ─────────────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (busId: string) => {
      if (selectedId) SocketService.leaveBusRoom(selectedId);

      setSelectedId(busId);
      setDirections(null);
      setRouteError(null);
      setInfoWindowId(null);

      if (!busId) return;

      SocketService.joinBusRoom(busId);

      const bus = buses.find((b) => b.busId === busId);
      if (bus) fetchDirections(bus);

      // Pan to last known position
      const loc = liveLocations.get(busId);
      if (loc && mapRef.current) {
        mapRef.current.panTo({ lat: loc.lat, lng: loc.lng });
        mapRef.current.setZoom(15);
      }
    },
    [selectedId, buses, liveLocations, fetchDirections]
  );

  const selectedBus = buses.find((b) => b.busId === selectedId);
  const selectedLoc = selectedId ? liveLocations.get(selectedId) : null;
  const activeBusCount = buses.filter((b) => liveLocations.has(b.busId)).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div style={styles.errorFull}>
        <div style={styles.errorCard}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
          <h2 style={{ margin: '0 0 8px', color: '#0f1d2e' }}>Google Maps failed to load</h2>
          <p style={{ color: '#4b5a6b', marginBottom: 20 }}>
            Check your API key in <code>frontend/.env</code> →{' '}
            <code>VITE_GOOGLE_MAPS_API_KEY</code>
          </p>
          <button style={styles.btnPrimary} onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={styles.errorFull}>
        <div className="spinner" />
        <p style={{ color: '#4b5a6b', marginTop: 16, fontSize: 15 }}>
          Loading Google Maps…
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>

      {/* ── Full-screen map ── */}
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={AGNI_CENTER}
        zoom={13}
        options={MAP_OPTIONS}
        onLoad={onMapLoad}
        onClick={() => setInfoWindowId(null)}
      >
        {/* Route */}
        {directions && (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: false,
              polylineOptions: {
                strokeColor: '#0f5d8f',
                strokeWeight: 5,
                strokeOpacity: 0.85,
              },
            }}
          />
        )}

        {/* Bus markers */}
        {Array.from(liveLocations.entries()).map(([busId, loc]) => {
          const isSelected = busId === selectedId;
          const bus = buses.find((b) => b.busId === busId);
          return (
            <Marker
              key={busId}
              position={{ lat: loc.lat, lng: loc.lng }}
              icon={BUS_SVG(isSelected)}
              zIndex={isSelected ? 10 : 1}
              onClick={() => setInfoWindowId(busId)}
            >
              {infoWindowId === busId && (
                <InfoWindow onCloseClick={() => setInfoWindowId(null)}>
                  <div style={styles.infoWindow}>
                    <div style={styles.infoTitle}>🚌 {bus?.busName || busId}</div>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Route</span>
                      <span style={styles.infoVal}>{bus?.routeName || '—'}</span>
                    </div>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Driver</span>
                      <span style={styles.infoVal}>{bus?.driverName || '—'}</span>
                    </div>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Speed</span>
                      <span style={styles.infoVal}>
                        {loc.speed != null ? `${loc.speed.toFixed(1)} km/h` : '—'}
                      </span>
                    </div>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Updated</span>
                      <span style={styles.infoVal}>
                        {loc.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    {!isSelected && (
                      <button
                        style={{ ...styles.btnPrimary, marginTop: 10, width: '100%', fontSize: 12, padding: '6px 12px' }}
                        onClick={() => handleSelect(busId)}
                      >
                        Track this bus
                      </button>
                    )}
                  </div>
                </InfoWindow>
              )}
            </Marker>
          );
        })}
      </GoogleMap>

      {/* ── Top navbar ── */}
      <div style={styles.navbar}>
        <div style={styles.navLeft}>
          <div style={styles.navLogo}>🚌</div>
          <div>
            <div style={styles.navTitle}>Bus Tracker</div>
            <div style={styles.navSub}>Agni College of Technology</div>
          </div>
        </div>
        <div style={styles.navRight}>
          <div style={{ ...styles.statusDot, background: isConnected ? '#1b7a5a' : '#c23d3d' }} />
          <span style={{ fontSize: 13, color: isConnected ? '#1b7a5a' : '#c23d3d', fontWeight: 600 }}>
            {isConnected ? 'Live' : 'Offline'}
          </span>
          <button style={styles.navBtn} onClick={() => navigate('/')}>Home</button>
        </div>
      </div>

      {/* ── Left panel: bus selector ── */}
      <div style={styles.leftPanel}>
        <div style={styles.panelHead}>Select Your Bus</div>

        <select style={styles.busSelect} value={selectedId} onChange={(e) => handleSelect(e.target.value)}>
          <option value="">— Choose a bus —</option>
          {buses.map((b) => {
            const hasLoc = liveLocations.has(b.busId);
            return (
              <option key={b.busId} value={b.busId}>
                {hasLoc ? '🟢 ' : '⚫ '}
                {b.busName}
                {b.routeName ? ` · ${b.routeName}` : ''}
              </option>
            );
          })}
        </select>

        {mapError && (
          <div style={styles.errBox}>{mapError}</div>
        )}

        {routeError && (
          <div style={styles.warnBox}>{routeError}</div>
        )}

        {loadingRoute && (
          <div style={{ textAlign: 'center', padding: '8px 0', color: '#4b5a6b', fontSize: 13 }}>
            Loading route…
          </div>
        )}

        {selectedBus ? (
          <div style={styles.metaGrid}>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Bus</span>
              <span style={styles.metaVal}>{selectedBus.busName}</span>
            </div>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Route</span>
              <span style={styles.metaVal}>{selectedBus.routeName || '—'}</span>
            </div>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Driver</span>
              <span style={styles.metaVal}>{selectedBus.driverName || '—'}</span>
            </div>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Status</span>
              <span style={{ ...styles.metaVal, color: selectedBus.isActive ? '#1b7a5a' : '#c23d3d' }}>
                {selectedBus.isActive ? '● Active' : '○ Idle'}
              </span>
            </div>
            {selectedLoc && (
              <>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Speed</span>
                  <span style={styles.metaVal}>
                    {selectedLoc.speed != null ? `${selectedLoc.speed.toFixed(1)} km/h` : '—'}
                  </span>
                </div>
                <div style={styles.metaItem}>
                  <span style={styles.metaLabel}>Updated</span>
                  <span style={styles.metaVal}>
                    {selectedLoc.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </>
            )}
            {!selectedLoc && (
              <div style={{ ...styles.warnBox, marginTop: 8 }}>
                Waiting for live location…
              </div>
            )}
          </div>
        ) : (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📍</div>
            <div style={{ fontSize: 13, color: '#4b5a6b', textAlign: 'center', lineHeight: 1.5 }}>
              Select a bus above to see its live location and route on the map
            </div>
          </div>
        )}

        {lastUpdate && (
          <div style={styles.lastUpdate}>
            Last signal: {lastUpdate.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* ── Bottom status bar ── */}
      <div style={styles.statusBar}>
        <span style={{ color: '#4b5a6b', fontSize: 12 }}>
          {activeBusCount} bus{activeBusCount !== 1 ? 'es' : ''} tracked
        </span>
        <span style={{ color: '#4b5a6b', fontSize: 12 }}>·</span>
        <span style={{ color: '#4b5a6b', fontSize: 12 }}>Agni College of Technology</span>
        <span style={{ color: '#4b5a6b', fontSize: 12 }}>·</span>
        <button style={styles.linkBtn} onClick={() => navigate('/driver/login')}>Driver</button>
        <button style={styles.linkBtn} onClick={() => navigate('/admin/login')}>Admin</button>
      </div>

      {/* ── Agni watermark ── */}
      <div style={styles.watermark}>
        🎓 Agni College of Technology
      </div>
    </div>
  );
};

// ─── Inline styles (no Tailwind dependency) ───────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  errorFull: {
    width: '100vw', height: '100vh',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#f4f0e8', gap: 8,
  },
  errorCard: {
    background: 'white', borderRadius: 20, padding: '40px 48px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.12)', textAlign: 'center', maxWidth: 420,
  },
  navbar: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 60,
    background: 'rgba(255,253,250,0.95)',
    backdropFilter: 'blur(16px)',
    borderBottom: '1px solid rgba(217,210,199,0.8)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', zIndex: 100,
    boxShadow: '0 2px 12px rgba(15,29,46,0.08)',
  },
  navLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  navLogo: { fontSize: 24 },
  navTitle: { fontWeight: 700, fontSize: 15, color: '#0f1d2e', letterSpacing: '-0.02em' },
  navSub: { fontSize: 11, color: '#4b5a6b', letterSpacing: '0.04em', textTransform: 'uppercase' },
  navRight: { display: 'flex', alignItems: 'center', gap: 10 },
  statusDot: { width: 8, height: 8, borderRadius: '50%' },
  navBtn: {
    background: 'rgba(15,93,143,0.1)', color: '#0f5d8f',
    border: '1px solid rgba(15,93,143,0.25)', borderRadius: 999,
    padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  leftPanel: {
    position: 'absolute', top: 72, left: 20, bottom: 56,
    width: 300, maxHeight: 'calc(100vh - 140px)',
    background: 'rgba(255,253,250,0.96)',
    backdropFilter: 'blur(16px)',
    borderRadius: 16, border: '1px solid rgba(217,210,199,0.8)',
    boxShadow: '0 8px 32px rgba(15,29,46,0.12)',
    padding: '16px 16px', overflow: 'auto',
    zIndex: 50,
  },
  panelHead: {
    fontSize: 13, fontWeight: 700, color: '#0f1d2e',
    letterSpacing: '0.06em', textTransform: 'uppercase',
    marginBottom: 10,
  },
  busSelect: {
    width: '100%', padding: '10px 12px',
    border: '1.5px solid #d9d2c7', borderRadius: 10,
    fontSize: 14, color: '#0f1d2e', background: 'white',
    cursor: 'pointer', outline: 'none',
    fontFamily: 'inherit',
  },
  metaGrid: { marginTop: 12, display: 'grid', gap: 8 },
  metaItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 10px', background: '#f4f0e8', borderRadius: 8,
  },
  metaLabel: { fontSize: 11, color: '#4b5a6b', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 },
  metaVal: { fontSize: 13, fontWeight: 600, color: '#0f1d2e', textAlign: 'right', maxWidth: 160 },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '24px 0',
  },
  errBox: {
    marginTop: 8, padding: '8px 12px', borderRadius: 8,
    background: 'rgba(194,61,61,0.08)', color: '#c23d3d',
    border: '1px solid rgba(194,61,61,0.2)', fontSize: 12,
  },
  warnBox: {
    marginTop: 8, padding: '8px 12px', borderRadius: 8,
    background: 'rgba(209,139,43,0.1)', color: '#d18b2b',
    border: '1px solid rgba(209,139,43,0.2)', fontSize: 12,
  },
  lastUpdate: {
    marginTop: 10, fontSize: 11, color: '#4b5a6b',
    textAlign: 'center', padding: '6px 0',
    borderTop: '1px solid #ebe5db',
  },
  statusBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 36,
    background: 'rgba(255,253,250,0.92)',
    backdropFilter: 'blur(12px)',
    borderTop: '1px solid rgba(217,210,199,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 12, zIndex: 100,
    fontSize: 12,
  },
  linkBtn: {
    background: 'none', border: 'none', color: '#0f5d8f',
    cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '0 4px',
    textDecoration: 'underline',
  },
  watermark: {
    position: 'absolute', bottom: 44, right: 20,
    fontSize: 11, color: 'rgba(15,29,46,0.35)',
    fontWeight: 500, letterSpacing: '0.04em',
    pointerEvents: 'none', userSelect: 'none',
    background: 'rgba(255,253,250,0.7)',
    padding: '4px 10px', borderRadius: 6,
    backdropFilter: 'blur(4px)',
    zIndex: 50,
  },
  infoWindow: {
    fontFamily: "'Segoe UI', sans-serif",
    minWidth: 180, padding: '4px 0',
  },
  infoTitle: {
    fontSize: 14, fontWeight: 700, color: '#0f1d2e',
    marginBottom: 8, paddingBottom: 6,
    borderBottom: '1px solid #ebe5db',
  },
  infoRow: {
    display: 'flex', justifyContent: 'space-between',
    gap: 12, padding: '3px 0', fontSize: 12,
  },
  infoLabel: { color: '#4b5a6b', fontWeight: 500 },
  infoVal: { color: '#0f1d2e', fontWeight: 600 },
  btnPrimary: {
    background: '#0f5d8f', color: 'white', border: 'none',
    borderRadius: 8, padding: '10px 20px', fontSize: 14,
    fontWeight: 600, cursor: 'pointer',
  },
};

export default StudentMapPage;
