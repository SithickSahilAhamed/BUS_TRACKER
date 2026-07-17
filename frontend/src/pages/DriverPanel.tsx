/**
 * DRIVER PANEL
 * Driver signs in with their own account, picks the bus they're driving,
 * starts the trip, and their phone GPS streams to Firestore (throttled).
 * The GPS watch itself lives in services/tracking.ts, not in this
 * component — so navigating to another page (e.g. "View map") and back
 * doesn't pause it. Only End Trip / Logout stop it.
 */

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Navbar, Alert, Button } from '../components/common';
import { useAuth } from '../context/AuthContext';
import { useBuses } from '../hooks/useBuses';
import { claimBus, releaseBus } from '../services/firestore';
import { getTrackingState, startTracking, stopTracking, subscribeTracking } from '../services/tracking';

const isNativeApp = Capacitor.isNativePlatform();

const WRITE_INTERVAL_SECONDS = 10;

export const DriverPanelPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();
  const { buses, loading: busesLoading } = useBuses();
  const tracking = useSyncExternalStore(subscribeTracking, getTrackingState);

  const [selectedBusId, setSelectedBusId] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [gpsAvailable, setGpsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isTracking = tracking.busId !== null;

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
      startTracking(selectedBusId);
      setSuccess('Trip started — your location is live on everyone\'s map. Keep this page open and your screen on.');
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
    startTracking(myBus.busId);
    setSuccess('Tracking resumed.');
  };

  const handleEndTrip = async () => {
    const busId = tracking.busId || myBus?.busId;
    setIsBusy(true);
    try {
      stopTracking();
      if (busId) await releaseBus(busId);
      setSuccess('Trip ended. You are no longer visible on the map.');
    } catch {
      setError('Ending the trip failed — try again.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleLogout = async () => {
    stopTracking();
    if (myBus) await releaseBus(myBus.busId).catch(() => {});
    await logout();
    navigate('/');
  };

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

            {/* Active claim from a previous session (a real page reload — in-app
                navigation no longer loses the tracking state) */}
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
                      GPS not available on this device. Turn on location services in your phone
                      settings, then reload this page.
                    </span>
                  </div>
                )}

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
                    <div className="status-value">{tracking.busId}</div>
                  </div>
                  <div className="status-card">
                    <div className="status-label">Updates sent</div>
                    <div className="status-value">{tracking.writeCount}</div>
                  </div>
                  <div className="status-card">
                    <div className="status-label">Last fix</div>
                    <div className="status-value">{tracking.lastFix ?? 'waiting…'}</div>
                  </div>
                </div>

                <Button fullWidth size="lg" variant="danger" isLoading={isBusy} onClick={handleEndTrip}>
                  ■ End Trip
                </Button>

                {isNativeApp ? (
                  <div className="alert alert-success" style={{ marginTop: '.75rem' }}>
                    <span>
                      ✓ Background tracking is active — you can lock your phone or switch apps and
                      your location will keep sending until you press End Trip.
                    </span>
                  </div>
                ) : (
                  <div className="alert alert-warning" style={{ marginTop: '.75rem' }}>
                    <span>
                      {wakeLockSupported
                        ? '⚠ Keep this tab open and in the foreground while driving. Your screen will stay on, but switching to another app still pauses GPS updates on most phones.'
                        : "⚠ Keep this screen on and this tab open while driving — this browser can't prevent the phone from sleeping automatically, which pauses GPS updates."}
                    </span>
                  </div>
                )}
              </>
            )}

            <div style={{ marginTop: '1.25rem' }} className="status-card">
              <div className="status-label">How to use</div>
              <ol style={{ paddingLeft: '1.1rem', margin: '.5rem 0 0', fontSize: '.85rem', color: 'var(--text-muted)', display: 'grid', gap: 4 }}>
                <li>Select the bus number you're driving today</li>
                <li>Press <strong>Start Trip</strong> and allow location access</li>
                <li>
                  {isNativeApp
                    ? 'You can lock your phone or switch apps — tracking keeps running until you end the trip'
                    : "Keep this page open and your screen on for the whole trip — the app doesn't send your location while it's in the background"}
                </li>
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
                <div className="gps-value">{tracking.current ? tracking.current.lat.toFixed(6) : '—'}</div>
              </div>
              <div className="gps-item">
                <div className="gps-label">Longitude</div>
                <div className="gps-value">{tracking.current ? tracking.current.lng.toFixed(6) : '—'}</div>
              </div>
              <div className="gps-item">
                <div className="gps-label">Speed</div>
                <div className="gps-value">{tracking.speed != null ? `${tracking.speed.toFixed(0)} km/h` : '—'}</div>
              </div>
              <div className="gps-item">
                <div className="gps-label">Accuracy</div>
                <div className="gps-value">{tracking.accuracy != null ? `±${tracking.accuracy.toFixed(0)} m` : '—'}</div>
              </div>
            </div>

            {isTracking && tracking.error && (
              <div className="alert alert-error">
                <span>⚠ {tracking.error}</span>
              </div>
            )}
            {isTracking && !tracking.error && !tracking.current && (
              <div className="alert alert-warning">
                <span>⚠ Waiting for a GPS fix… make sure location is enabled.</span>
              </div>
            )}

            <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: '.75rem' }}>
              Your position is sent every ~{WRITE_INTERVAL_SECONDS} seconds while the bus is
              moving. Students, professors and the admin see it instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverPanelPage;
