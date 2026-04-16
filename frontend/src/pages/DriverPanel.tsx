/**
 * DRIVER PANEL
 * GPS tracking interface with simulation fallback.
 * Reads busId + token from localStorage (set by DriverLogin).
 * When GPS is unavailable, driver can enable simulation mode
 * which sends synthetic route waypoints for demo purposes.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SocketService from '../services/socket';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Agni College area waypoints for simulation (Navalur → Agni College)
const SIM_WAYPOINTS = [
  { lat: 12.8250, lng: 80.2210 }, // Navalur start
  { lat: 12.8290, lng: 80.2190 },
  { lat: 12.8340, lng: 80.2170 },
  { lat: 12.8380, lng: 80.2150 },
  { lat: 12.8410, lng: 80.2130 },
  { lat: 12.8435, lng: 80.2100 },
  { lat: 12.8450, lng: 80.2070 },
  { lat: 12.8460, lng: 80.2050 },
  { lat: 12.8470, lng: 80.2035 },
  { lat: 12.8474, lng: 80.2026 }, // Agni College
];

export const DriverPanelPage: React.FC = () => {
  const navigate = useNavigate();

  const storedBusId   = localStorage.getItem('driverBusId')   || '';
  const storedBusName = localStorage.getItem('driverBusName') || storedBusId;
  const storedToken   = localStorage.getItem('authToken')     || '';

  // ── State ───────────────────────────────────────────────────────────────────
  const [isTracking,    setIsTracking]    = useState(false);
  const [isBusy,        setIsBusy]        = useState(false);
  const [isConnected,   setIsConnected]   = useState(false);
  const [isSimMode,     setIsSimMode]     = useState(false);
  const [simRunning,    setSimRunning]    = useState(false);
  const [simIndex,      setSimIndex]      = useState(0);
  const [gpsAvailable,  setGpsAvailable]  = useState<boolean | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [success,       setSuccess]       = useState<string | null>(null);
  const [currentLat,    setCurrentLat]    = useState<number | null>(null);
  const [currentLng,    setCurrentLng]    = useState<number | null>(null);
  const [accuracy,      setAccuracy]      = useState<number | null>(null);
  const [speed,         setSpeed]         = useState<number | null>(null);
  const [lastFix,       setLastFix]       = useState<string | null>(null);
  const [broadcastCount, setBroadcastCount] = useState(0);

  const watchIdRef     = useRef<number | null>(null);
  const simTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const simIdxRef      = useRef(0);

  // ── Socket connection ────────────────────────────────────────────────────────
  useEffect(() => {
    SocketService.connect(storedToken)
      .then(() => setIsConnected(true))
      .catch(() => setIsConnected(false));

    const handleConnect    = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleAuthError  = (d: { message: string }) => {
      setError(d.message);
      setIsTracking(false);
    };

    const socket = SocketService.rawSocket;
    if (socket) {
      socket.on('connect',    handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('auth_error', handleAuthError);
    }

    return () => {
      const s = SocketService.rawSocket;
      if (s) {
        s.off('connect',    handleConnect);
        s.off('disconnect', handleDisconnect);
        s.off('auth_error', handleAuthError);
      }
    };
  }, [storedToken]);

  // ── GPS availability probe on mount ────────────────────────────────────────
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

  // ── Emit location to socket ─────────────────────────────────────────────────
  const emitLocation = useCallback((lat: number, lng: number, acc?: number, spd?: number) => {
    SocketService.rawEmit('driver_location_update', {
      busId:     storedBusId,
      latitude:  lat,
      longitude: lng,
      accuracy:  acc ?? null,
      speed:     spd ?? null,
      token:     storedToken,
    });
    setBroadcastCount(c => c + 1);
    setCurrentLat(lat);
    setCurrentLng(lng);
    if (acc !== undefined) setAccuracy(acc);
    if (spd !== undefined) setSpeed(spd);
    setLastFix(new Date().toLocaleTimeString());
  }, [storedBusId, storedToken]);

  // ── Real GPS tracking ───────────────────────────────────────────────────────
  const startRealGps = useCallback(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        emitLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          pos.coords.speed ? pos.coords.speed * 3.6 : undefined // m/s → km/h
        );
      },
      (err) => {
        console.warn('GPS error:', err.message);
        if (isTracking) setError('GPS signal lost. Consider switching to simulation mode.');
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 }
    );
  }, [emitLocation, isTracking]);

  const stopRealGps = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // ── Simulation mode ─────────────────────────────────────────────────────────
  const startSimulation = useCallback(() => {
    simIdxRef.current = 0;
    setSimIndex(0);
    setSimRunning(true);

    // Send first point immediately
    const first = SIM_WAYPOINTS[0];
    emitLocation(first.lat, first.lng, 5, 35);

    simTimerRef.current = setInterval(() => {
      simIdxRef.current = (simIdxRef.current + 1) % SIM_WAYPOINTS.length;
      const wp = SIM_WAYPOINTS[simIdxRef.current];
      const simSpeed = 25 + Math.random() * 20; // 25–45 km/h
      emitLocation(wp.lat, wp.lng, 5, parseFloat(simSpeed.toFixed(1)));
      setSimIndex(simIdxRef.current);
    }, 4000); // new point every 4 seconds
  }, [emitLocation]);

  const stopSimulation = useCallback(() => {
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setSimRunning(false);
    simIdxRef.current = 0;
    setSimIndex(0);
  }, []);

  // ── Start tracking ──────────────────────────────────────────────────────────
  const handleStartTracking = async () => {
    if (!storedBusId) { setError('No bus assigned. Please log in again.'); return; }
    setIsBusy(true);
    setError(null);

    try {
      // Notify backend trip started
      await fetch(`${API_BASE}/bus/${storedBusId}/start-trip`, { method: 'POST' });

      // Join socket room
      SocketService.rawEmit('driver_joined', { busId: storedBusId, token: storedToken });

      setIsTracking(true);
      setBroadcastCount(0);

      if (isSimMode) {
        startSimulation();
        setSuccess('Simulation mode active — sending GPS waypoints to students.');
      } else {
        startRealGps();
        setSuccess('GPS tracking active — broadcasting live position.');
      }
    } catch {
      setError('Failed to start trip. Check your connection.');
    } finally {
      setIsBusy(false);
    }
  };

  // ── Stop tracking ───────────────────────────────────────────────────────────
  const handleStopTracking = async () => {
    setIsBusy(true);

    try {
      stopRealGps();
      stopSimulation();

      await fetch(`${API_BASE}/bus/${storedBusId}/stop-trip`, { method: 'POST' });

      SocketService.rawEmit('trip_stopped', { busId: storedBusId });

      setIsTracking(false);
      setCurrentLat(null);
      setCurrentLng(null);
      setSpeed(null);
      setAccuracy(null);
      setLastFix(null);
      setSuccess('Trip ended. Location broadcasting stopped.');
    } catch {
      setError('Failed to stop trip. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  // ── Logout ──────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    stopRealGps();
    stopSimulation();
    localStorage.removeItem('driverBusId');
    localStorage.removeItem('driverBusName');
    localStorage.removeItem('authToken');
    navigate('/driver/login');
  };

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopRealGps();
      stopSimulation();
    };
  }, [stopRealGps, stopSimulation]);

  const simProgress = ((simIndex + 1) / SIM_WAYPOINTS.length) * 100;

  return (
    <div style={{ minHeight: '100vh', background: '#f7f9fc', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Navbar ── */}
      <nav style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 24px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#22c55e' : '#94a3b8' }}/>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>Driver Panel</span>
          {storedBusName && (
            <span style={{
              background: '#f0f6ff',
              color: '#0f5d8f',
              padding: '2px 10px',
              borderRadius: 999,
              fontSize: '0.78rem',
              fontWeight: 600,
            }}>
              {storedBusName}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontSize: '0.78rem',
            color: isConnected ? '#16a34a' : '#64748b',
            fontWeight: 600,
          }}>
            {isConnected ? '● Connected' : '○ Offline'}
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: '0.82rem',
              cursor: 'pointer',
              color: '#475569',
              fontWeight: 600,
            }}
          >
            Log out
          </button>
        </div>
      </nav>

      {/* ── Body ── */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px', display: 'grid', gap: 20 }}>

        {/* Alerts */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10,
            padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', color: '#b91c1c', fontSize: '0.88rem',
          }}>
            <span>⚠ {error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontWeight: 700 }}>✕</button>
          </div>
        )}
        {success && (
          <div style={{
            background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10,
            padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', color: '#15803d', fontSize: '0.88rem',
          }}>
            <span>✓ {success}</span>
            <button onClick={() => setSuccess(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803d', fontWeight: 700 }}>✕</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* ── Trip Control ── */}
          <div style={{ background: 'white', borderRadius: 16, padding: '24px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase', marginBottom: 20 }}>
              Trip Control
            </div>

            {/* Bus info */}
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', marginBottom: 20, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: '#64748b' }}>Assigned bus</span>
                <strong style={{ color: '#0f172a' }}>{storedBusName || '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: '#64748b' }}>Status</span>
                <strong style={{ color: isTracking ? '#16a34a' : '#64748b' }}>
                  {isTracking ? (isSimMode ? 'Simulating' : 'Live GPS') : 'Idle'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: '#64748b' }}>Broadcasts</span>
                <strong style={{ color: '#0f172a' }}>{broadcastCount}</strong>
              </div>
            </div>

            {/* GPS availability notice */}
            {gpsAvailable === false && !isTracking && (
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                padding: '10px 12px', marginBottom: 16, fontSize: '0.82rem', color: '#92400e',
              }}>
                GPS not detected on this device.
                <br/>Enable <strong>Simulation Mode</strong> below to demo tracking.
              </div>
            )}

            {/* Simulation mode toggle */}
            {!isTracking && (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
                cursor: 'pointer', marginBottom: 16, background: isSimMode ? '#f0f6ff' : '#fafafa',
              }}>
                <div
                  onClick={() => setIsSimMode(v => !v)}
                  style={{
                    width: 40, height: 22, borderRadius: 999,
                    background: isSimMode ? '#0f5d8f' : '#cbd5e1',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, left: isSimMode ? 20 : 2,
                    width: 18, height: 18, borderRadius: '50%',
                    background: 'white', transition: 'left 0.2s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                  }}/>
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>Simulation Mode</div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                    {isSimMode ? 'Will send synthetic GPS waypoints' : 'Uses real GPS from this device'}
                  </div>
                </div>
              </label>
            )}

            {/* Start / Stop button */}
            {!isTracking ? (
              <button
                disabled={!storedBusId || isBusy}
                onClick={handleStartTracking}
                style={{
                  width: '100%', padding: '14px', borderRadius: 10, border: 'none',
                  background: storedBusId && !isBusy ? '#0f5d8f' : '#cbd5e1',
                  color: 'white', fontSize: '0.95rem', fontWeight: 700,
                  cursor: storedBusId && !isBusy ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                }}
              >
                {isBusy ? 'Starting…' : (isSimMode ? '▶ Start Simulation' : '▶ Start Tracking')}
              </button>
            ) : (
              <button
                disabled={isBusy}
                onClick={handleStopTracking}
                style={{
                  width: '100%', padding: '14px', borderRadius: 10, border: 'none',
                  background: isBusy ? '#cbd5e1' : '#dc2626',
                  color: 'white', fontSize: '0.95rem', fontWeight: 700,
                  cursor: isBusy ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {isBusy ? 'Stopping…' : '■ End Trip'}
              </button>
            )}

            {/* Simulation progress */}
            {simRunning && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b', marginBottom: 6 }}>
                  <span>Route progress</span>
                  <span>Stop {simIndex + 1} / {SIM_WAYPOINTS.length}</span>
                </div>
                <div style={{ height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', background: '#0f5d8f',
                    width: `${simProgress}%`, borderRadius: 999,
                    transition: 'width 0.4s ease',
                  }}/>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#0f5d8f', marginTop: 4 }}>
                  {simIndex < SIM_WAYPOINTS.length - 1 ? 'En route to Agni College…' : 'Arrived at Agni College'}
                </div>
              </div>
            )}

            {/* How to use */}
            <div style={{ marginTop: 20, background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                How to use
              </div>
              <ol style={{ paddingLeft: '1.1rem', display: 'grid', gap: 5, fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
                {isSimMode ? (
                  <>
                    <li>Enable Simulation Mode (already on)</li>
                    <li>Press <strong>Start Simulation</strong></li>
                    <li>Bus will move along route on student map</li>
                    <li>Press <strong>End Trip</strong> when done</li>
                  </>
                ) : (
                  <>
                    <li>Enable GPS / Location on this device</li>
                    <li>Press <strong>Start Tracking</strong></li>
                    <li>Keep this page open while driving</li>
                    <li>Press <strong>End Trip</strong> at destination</li>
                  </>
                )}
              </ol>
            </div>
          </div>

          {/* ── Live Telemetry ── */}
          <div style={{ background: 'white', borderRadius: 16, padding: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
              Live Telemetry
            </div>

            {/* Status grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'GPS', value: isTracking && !isSimMode ? 'Active' : (isSimMode && simRunning ? 'Simulated' : 'Idle'), ok: isTracking },
                { label: 'Accuracy', value: accuracy !== null ? `±${accuracy.toFixed(0)} m` : '—', ok: null },
                { label: 'Connection', value: isConnected ? 'Online' : 'Offline', ok: isConnected },
                { label: 'Speed', value: speed !== null ? `${speed.toFixed(1)} km/h` : '—', ok: null },
              ].map(item => (
                <div key={item.label} style={{
                  background: '#f8fafc', borderRadius: 10, padding: '12px 14px',
                  border: '1px solid #f1f5f9',
                }}>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                  <div style={{
                    fontSize: '1rem', fontWeight: 700,
                    color: item.ok === true ? '#16a34a' : item.ok === false ? '#dc2626' : '#0f172a',
                  }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Coordinates */}
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px', border: '1px solid #f1f5f9', display: 'grid', gap: 8 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Current coordinates
              </div>
              {[
                { label: 'Latitude',  value: currentLat !== null ? currentLat.toFixed(6) : '—' },
                { label: 'Longitude', value: currentLng !== null ? currentLng.toFixed(6) : '—' },
                { label: 'Last fix',  value: lastFix || '—' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: '#64748b' }}>{row.label}</span>
                  <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{row.value}</strong>
                </div>
              ))}
            </div>

            {/* Mode badge */}
            <div style={{
              borderRadius: 10,
              padding: '10px 14px',
              background: isSimMode ? 'rgba(15,93,143,0.06)' : 'rgba(27,122,90,0.06)',
              border: `1px solid ${isSimMode ? 'rgba(15,93,143,0.15)' : 'rgba(27,122,90,0.15)'}`,
              fontSize: '0.82rem',
              color: isSimMode ? '#0f5d8f' : '#1b7a5a',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span>{isSimMode ? '🔵' : '🟢'}</span>
              <span>{isSimMode ? 'Simulation mode — synthetic GPS data' : 'Real GPS mode — device location'}</span>
            </div>

            {/* GPS warning when real tracking and no signal */}
            {isTracking && !isSimMode && currentLat === null && (
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                padding: '10px 12px', fontSize: '0.82rem', color: '#92400e',
              }}>
                ⚠ Waiting for GPS signal… Ensure location is enabled on this device.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverPanelPage;
