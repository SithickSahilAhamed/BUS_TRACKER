/**
 * DRIVER PANEL
 * Driver signs in with their own account, picks the bus they're driving,
 * starts the trip, and their phone GPS streams to Firestore (throttled).
 * Includes a simulation fallback for demos on devices without GPS.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar, Alert, Button } from '../components/common';
import { useAuth } from '../context/AuthContext';
import { useBuses } from '../hooks/useBuses';
import { claimBus, releaseBus, writeBusLocation } from '../services/firestore';
import type { LatLng } from '../types';

// Firestore write throttle — keeps a full day of driving inside the free quota
const WRITE_INTERVAL_MS = 5_000;
const MIN_MOVE_METERS = 10;
const HEARTBEAT_MS = 25_000; // still write occasionally when stopped at a signal

// Fallback demo route (Navalur → Agni College) when a bus has no saved route
const SIM_FALLBACK: LatLng[] = [
  { lat: 12.825, lng: 80.221 },
  { lat: 12.829, lng: 80.219 },
  { lat: 12.834, lng: 80.217 },
  { lat: 12.838, lng: 80.215 },
  { lat: 12.841, lng: 80.213 },
  { lat: 12.8435, lng: 80.21 },
  { lat: 12.845, lng: 80.207 },
  { lat: 12.846, lng: 80.205 },
  { lat: 12.847, lng: 80.2035 },
  { lat: 12.8474, lng: 80.2026 },
];

const haversineMeters = (a: LatLng, b: LatLng): number => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

export const DriverPanelPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();
  const { buses, loading: busesLoading } = useBuses();

  const [selectedBusId, setSelectedBusId] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isSimMode, setIsSimMode] = useState(false);
  const [gpsAvailable, setGpsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [current, setCurrent] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [lastFix, setLastFix] = useState<string | null>(null);
  const [writeCount, setWriteCount] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<any>(null);
  const lastWriteRef = useRef<{ at: number; pos: LatLng } | null>(null);
  const trackedBusRef = useRef<string>('');

  // The bus this driver currently holds a claim on (survives page refreshes)
  const myBus = useMemo(
    () => buses.find((b) => b.activeDriverId === user?.uid) ?? null,
    [buses, user?.uid]
  );

  // ── GPS availability probe ──────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsAvailable(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setGpsAvailable(true),
      () => setGpsAvailable(false),
      { timeout: 4000, maximumAge: 30000 }
    );
  }, []);

  // ── Wake lock (keep phone screen on while tracking) ─────────────────────────
  const acquireWakeLock = useCallback(async () => {
    try {
      wakeLockRef.current = await (navigator as any).wakeLock?.request('screen');
    } catch {
      /* unsupported (e.g. old iOS Safari) — the UI shows a "keep screen on" hint */
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      // The OS silently drops wake locks when the tab is hidden — re-acquire
      if (document.visibilityState === 'visible' && isTracking) acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isTracking, acquireWakeLock]);

  // ── Location pipeline: every fix updates the UI, throttled writes hit Firestore
  const handleFix = useCallback(
    (pos: LatLng, acc: number | null, spdKmh: number | null, heading: number | null) => {
      setCurrent(pos);
      setAccuracy(acc);
      setSpeed(spdKmh);
      setLastFix(new Date().toLocaleTimeString());

      const busId = trackedBusRef.current;
      if (!busId) return;

      const now = Date.now();
      const last = lastWriteRef.current;
      const movedEnough = !last || haversineMeters(last.pos, pos) >= MIN_MOVE_METERS;
      const intervalOk = !last || now - last.at >= WRITE_INTERVAL_MS;
      const heartbeatDue = last && now - last.at >= HEARTBEAT_MS;

      if ((intervalOk && movedEnough) || heartbeatDue) {
        lastWriteRef.current = { at: now, pos };
        writeBusLocation(busId, {
          lat: pos.lat,
          lng: pos.lng,
          speedKmh: spdKmh,
          heading,
          accuracy: acc,
        })
          .then(() => setWriteCount((c) => c + 1))
          .catch((e) => {
            console.error('Location write failed:', e);
            setError('Sending your location failed — check your internet connection.');
          });
      }
    },
    []
  );

  // ── Real GPS ────────────────────────────────────────────────────────────────
  const startRealGps = useCallback(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) =>
        handleFix(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          pos.coords.accuracy ?? null,
          pos.coords.speed != null ? pos.coords.speed * 3.6 : null, // m/s → km/h
          pos.coords.heading ?? null
        ),
      (err) => {
        console.warn('GPS error:', err.message);
        setError('GPS signal lost. Keep the phone near a window, or use simulation mode.');
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
  }, [handleFix]);

  const stopRealGps = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // ── Simulation ──────────────────────────────────────────────────────────────
  const startSimulation = useCallback(
    (busId: string) => {
      const bus = buses.find((b) => b.busId === busId);
      const path = bus?.routePath?.length ? bus.routePath : SIM_FALLBACK;
      // Walk the whole route in ~40 steps regardless of how detailed it is
      const step = Math.max(1, Math.ceil(path.length / 40));
      let idx = 0;

      const tick = () => {
        const p = path[Math.min(idx, path.length - 1)];
        handleFix(p, 5, 25 + Math.random() * 20, null);
        idx = idx + step >= path.length ? 0 : idx + step;
      };
      tick();
      simTimerRef.current = setInterval(tick, 5000);
    },
    [buses, handleFix]
  );

  const stopSimulation = useCallback(() => {
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
  }, []);

  // ── Start / resume / stop ───────────────────────────────────────────────────
  const beginTracking = useCallback(
    (busId: string) => {
      trackedBusRef.current = busId;
      lastWriteRef.current = null;
      setWriteCount(0);
      setIsTracking(true);
      acquireWakeLock();
      if (isSimMode) startSimulation(busId);
      else startRealGps();
    },
    [acquireWakeLock, isSimMode, startSimulation, startRealGps]
  );

  const handleStartTrip = async () => {
    if (!user || !profile) return;
    if (!selectedBusId) {
      setError('Pick the bus you are driving first.');
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await claimBus(selectedBusId, { uid: user.uid, name: profile.name });
      beginTracking(selectedBusId);
      setSuccess(
        isSimMode
          ? 'Simulation running — the bus is moving on everyone\'s map.'
          : 'Trip started — your location is live on everyone\'s map. Keep this page open.'
      );
    } catch (e) {
      console.error(e);
      setError(
        'Could not start the trip. Another driver may have taken this bus, or your account is deactivated.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleResumeTracking = () => {
    if (!myBus) return;
    setError(null);
    beginTracking(myBus.busId);
    setSuccess('Tracking resumed.');
  };

  const stopEverything = useCallback(() => {
    stopRealGps();
    stopSimulation();
    releaseWakeLock();
    trackedBusRef.current = '';
    setIsTracking(false);
    setCurrent(null);
    setSpeed(null);
    setAccuracy(null);
    setLastFix(null);
  }, [stopRealGps, stopSimulation, releaseWakeLock]);

  const handleEndTrip = async () => {
    const busId = trackedBusRef.current || myBus?.busId;
    setIsBusy(true);
    try {
      stopEverything();
      if (busId) await releaseBus(busId);
      setSuccess('Trip ended. You are no longer visible on the map.');
    } catch {
      setError('Ending the trip failed — try again.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleLogout = async () => {
    stopEverything();
    if (myBus) await releaseBus(myBus.busId).catch(() => {});
    await logout();
    navigate('/');
  };

  // Cleanup on unmount (does not end the trip — refresh keeps the claim)
  useEffect(() => stopEverything, [stopEverything]);

  const claimedElsewhere = (busId: string) => {
    const bus = buses.find((b) => b.busId === busId);
    return !!bus?.activeDriverId && bus.activeDriverId !== user?.uid;
  };

  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  return (
    <div className="campus-shell">
      <Navbar
        title="Driver Panel"
        subtitle={profile ? profile.name : 'Agni College of Technology'}
        rightAction={
          <>
            <span className={`chip ${isTracking ? '' : 'offline'}`}>
              <span className={`status-dot ${isTracking ? 'live' : 'offline'}`} />
              {isTracking ? 'Broadcasting' : 'Idle'}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/map')}>
              View map
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </>
        }
      />

      <div className="campus-section" style={{ maxWidth: 960 }}>
        {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
        {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

        <div className="two-col">
          {/* ── Trip control ── */}
          <div className="panel">
            <div className="panel-title">Trip Control</div>

            {/* Active claim from a previous session */}
            {myBus && !isTracking && (
              <div className="alert alert-warning">
                <span>
                  You still have an active trip on <strong>{myBus.busId}</strong>.
                </span>
                <span style={{ display: 'flex', gap: '.5rem' }}>
                  <Button size="sm" onClick={handleResumeTracking}>Resume</Button>
                  <Button size="sm" variant="danger" onClick={handleEndTrip}>End trip</Button>
                </span>
              </div>
            )}

            {!isTracking && !myBus && (
              <>
                <div className="form-group">
                  <label className="form-label">Which bus are you driving?</label>
                  <select
                    className="form-control"
                    value={selectedBusId}
                    onChange={(e) => setSelectedBusId(e.target.value)}
                    disabled={busesLoading}
                  >
                    <option value="">
                      {busesLoading ? 'Loading buses…' : 'Select your bus…'}
                    </option>
                    {buses.map((bus) => (
                      <option key={bus.busId} value={bus.busId} disabled={claimedElsewhere(bus.busId)}>
                        {bus.busId} · {bus.busName}
                        {claimedElsewhere(bus.busId) ? ` (in use by ${bus.activeDriverName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {gpsAvailable === false && (
                  <div className="alert alert-warning">
                    <span>
                      GPS not available on this device. Turn on location, or use simulation mode
                      below for a demo.
                    </span>
                  </div>
                )}

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.6rem',
                    marginBottom: '1rem',
                    cursor: 'pointer',
                    fontSize: '.9rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSimMode}
                    onChange={(e) => setIsSimMode(e.target.checked)}
                  />
                  Simulation mode (demo without real GPS)
                </label>

                <Button
                  fullWidth
                  size="lg"
                  isLoading={isBusy}
                  disabled={!selectedBusId || isBusy}
                  onClick={handleStartTrip}
                >
                  ▶ Start Trip
                </Button>
              </>
            )}

            {isTracking && (
              <>
                <div className="status-grid" style={{ marginBottom: '1rem' }}>
                  <div className="status-card">
                    <div className="status-label">Bus</div>
                    <div className="status-value">{trackedBusRef.current}</div>
                  </div>
                  <div className="status-card">
                    <div className="status-label">Mode</div>
                    <div className="status-value">{isSimMode ? 'Simulation' : 'Live GPS'}</div>
                  </div>
                  <div className="status-card">
                    <div className="status-label">Updates sent</div>
                    <div className="status-value">{writeCount}</div>
                  </div>
                  <div className="status-card">
                    <div className="status-label">Last fix</div>
                    <div className="status-value">{lastFix ?? 'waiting…'}</div>
                  </div>
                </div>

                <Button fullWidth size="lg" variant="danger" isLoading={isBusy} onClick={handleEndTrip}>
                  ■ End Trip
                </Button>

                {!wakeLockSupported && (
                  <p style={{ fontSize: '.82rem', color: 'var(--warning)', marginTop: '.75rem' }}>
                    ⚠ Keep this screen on while driving — this browser can't prevent the phone from
                    sleeping automatically.
                  </p>
                )}
              </>
            )}

            <div style={{ marginTop: '1.25rem' }} className="status-card">
              <div className="status-label">How to use</div>
              <ol style={{ paddingLeft: '1.1rem', margin: '.5rem 0 0', fontSize: '.85rem', color: 'var(--text-muted)', display: 'grid', gap: 4 }}>
                <li>Select the bus number you're driving today</li>
                <li>Press <strong>Start Trip</strong> and allow location access</li>
                <li>Keep this page open while driving</li>
                <li>Press <strong>End Trip</strong> when you arrive</li>
              </ol>
            </div>
          </div>

          {/* ── Telemetry ── */}
          <div className="panel">
            <div className="panel-title">Live Telemetry</div>
            <div className="gps-grid">
              <div className="gps-item">
                <div className="gps-label">Latitude</div>
                <div className="gps-value">{current ? current.lat.toFixed(6) : '—'}</div>
              </div>
              <div className="gps-item">
                <div className="gps-label">Longitude</div>
                <div className="gps-value">{current ? current.lng.toFixed(6) : '—'}</div>
              </div>
              <div className="gps-item">
                <div className="gps-label">Speed</div>
                <div className="gps-value">{speed != null ? `${speed.toFixed(0)} km/h` : '—'}</div>
              </div>
              <div className="gps-item">
                <div className="gps-label">Accuracy</div>
                <div className="gps-value">{accuracy != null ? `±${accuracy.toFixed(0)} m` : '—'}</div>
              </div>
            </div>

            {isTracking && !isSimMode && !current && (
              <div className="alert alert-warning">
                <span>⚠ Waiting for a GPS fix… make sure location is enabled.</span>
              </div>
            )}

            <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: '.75rem' }}>
              Your position is sent every ~{WRITE_INTERVAL_MS / 1000} seconds while the bus is
              moving. Students, professors and the admin see it instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverPanelPage;
