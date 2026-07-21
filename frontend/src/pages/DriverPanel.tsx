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
import { Navbar, Alert, Button, Select } from '../components/common';
import { ChatAssistant } from '../components/ChatAssistant';
import { SosButton } from '../components/SosButton';
import { NotificationBell } from '../components/NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useBuses } from '../hooks/useBuses';
import {
  claimBus,
  releaseBus,
  setStudentBoarded,
  subscribeToStudents,
  submitDriverReport,
  logCompletedTrip,
} from '../services/firestore';
import { getTrackingState, startTracking, stopTracking, subscribeTracking } from '../services/tracking';
import { getNextStop } from '../utils/eta';
import { DAMAGE_CATEGORIES, INCIDENT_CATEGORIES, type ReportType, type UserProfile } from '../types';

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
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [boardingBusy, setBoardingBusy] = useState<string | null>(null); // uid currently being toggled

  // Report Incident / Report Damage modal
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [reportForm, setReportForm] = useState({ category: '', description: '' });
  const [reportSaving, setReportSaving] = useState(false);

  const isTracking = tracking.busId !== null;

  // The bus this driver currently holds a claim on (survives page refreshes)
  const myBus = useMemo(
    () => buses.find((b) => b.activeDriverId === user?.uid) ?? null,
    [buses, user?.uid]
  );

  useEffect(() => {
    const unsub = subscribeToStudents(setStudents, () => {});
    return unsub;
  }, []);

  // Next stop ahead, and who's assigned to board there this trip
  const nextStop = useMemo(
    () => (myBus ? getNextStop(myBus.stops, myBus.routePath, myBus.lastLocation) : null),
    [myBus]
  );
  const stopRiders = useMemo(
    () =>
      nextStop && myBus
        ? students.filter((s) => s.assignedBusId === myBus.busId && s.assignedStopName === nextStop.name)
        : [],
    [students, myBus, nextStop]
  );
  const boardedCount = stopRiders.filter((s) => myBus?.boardedStudentIds?.includes(s.uid)).length;

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

  // Best-effort — a failed trip-history write shouldn't block ending the
  // trip itself, so errors here are swallowed (unlike releaseBus's).
  const logTripIfPossible = async (bus: typeof myBus) => {
    if (!bus || !user || !profile || !bus.tripStartedAt) return;
    try {
      await logCompletedTrip({
        busId: bus.busId,
        busNumber: bus.busNumber,
        routeName: bus.routeName,
        driverId: user.uid,
        driverName: profile.name,
        startedAt: bus.tripStartedAt,
      });
    } catch (e) {
      console.warn('Could not log trip history:', e);
    }
  };

  const handleEndTrip = async () => {
    const busId = tracking.busId || myBus?.busId;
    setIsBusy(true);
    try {
      stopTracking();
      await logTripIfPossible(myBus);
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
    if (myBus) {
      await logTripIfPossible(myBus);
      await releaseBus(myBus.busId).catch(() => {});
    }
    await logout();
    navigate('/');
  };

  const claimedElsewhere = (busId: string) => {
    const bus = buses.find((b) => b.busId === busId);
    return !!bus?.activeDriverId && bus.activeDriverId !== user?.uid;
  };

  const handleToggleBoarded = async (uid: string, boarded: boolean) => {
    if (!myBus) return;
    setBoardingBusy(uid);
    try {
      await setStudentBoarded(myBus.busId, uid, boarded);
    } catch {
      setError('Updating boarding status failed.');
    } finally {
      setBoardingBusy(null);
    }
  };

  const reportBusId = myBus?.busId || selectedBusId;

  const openReportModal = (type: ReportType) => {
    setReportType(type);
    setReportForm({ category: '', description: '' });
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportType || !user || !profile || !reportBusId) return;
    const bus = buses.find((b) => b.busId === reportBusId);
    setReportSaving(true);
    try {
      await submitDriverReport({
        type: reportType,
        category: reportForm.category,
        description: reportForm.description,
        busId: reportBusId,
        busNumber: bus?.busNumber ?? reportBusId,
        driverId: user.uid,
        driverName: profile.name,
      });
      setSuccess(`${reportType === 'incident' ? 'Incident' : 'Damage'} report sent to the admin.`);
      setReportType(null);
    } catch {
      setError('Sending the report failed — try again.');
    } finally {
      setReportSaving(false);
    }
  };

  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const buildChatContext = () => ({
    driverName: profile?.name,
    tripStatus: isTracking ? 'on trip, GPS broadcasting' : myBus ? 'has a claimed bus but not currently tracking' : 'not on a trip',
    currentBus: myBus ? { busId: myBus.busId, routeName: myBus.routeName } : null,
    nextStop: nextStop
      ? { name: nextStop.name, waitingCount: stopRiders.length - boardedCount, boardedCount, totalAssignedHere: stopRiders.length }
      : null,
  });

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
            <NotificationBell />
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

          {/* ── Next stop + boarding ── */}
          {myBus && (
            <div className="panel">
              <div className="panel-title">Next Stop</div>
              {!nextStop ? (
                <p style={{ color: 'var(--text-muted)' }}>
                  {myBus.stops?.length
                    ? 'End of the route — no more stops ahead.'
                    : 'This bus has no saved stops yet.'}
                </p>
              ) : (
                <>
                  <div className="status-grid" style={{ marginBottom: '1rem' }}>
                    <div className="status-card">
                      <div className="status-label">Stop</div>
                      <div className="status-value">{nextStop.name}</div>
                    </div>
                    <div className="status-card">
                      <div className="status-label">Boarded</div>
                      <div className="status-value">{boardedCount} / {stopRiders.length}</div>
                    </div>
                  </div>

                  {stopRiders.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>
                      No students are assigned to this stop.
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gap: '.4rem' }}>
                      {stopRiders.map((s) => {
                        const boarded = !!myBus.boardedStudentIds?.includes(s.uid);
                        return (
                          <label
                            key={s.uid}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '.6rem',
                              padding: '.5rem .65rem', borderRadius: 'var(--radius)',
                              background: 'var(--surface-2)', border: '1px solid var(--border)',
                              fontSize: '.88rem', cursor: boardingBusy ? 'wait' : 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={boarded}
                              disabled={boardingBusy === s.uid}
                              onChange={(e) => handleToggleBoarded(s.uid, e.target.checked)}
                            />
                            <span style={{ flex: 1, textDecoration: boarded ? 'line-through' : 'none', opacity: boarded ? 0.6 : 1 }}>
                              {s.name}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Report an issue ── */}
        <div className="panel" style={{ marginTop: '1.5rem' }}>
          <div className="panel-title">Report an Issue</div>
          {!reportBusId ? (
            <p style={{ color: 'var(--text-muted)' }}>Select your bus above first.</p>
          ) : (
            <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => openReportModal('incident')}>
                🚧 Report Incident
              </Button>
              <Button variant="secondary" onClick={() => openReportModal('damage')}>
                🔧 Report Damage
              </Button>
            </div>
          )}
        </div>
      </div>

      <ChatAssistant title="Driver Assistant" examplePrompt="Which stop has the most students waiting?" buildContext={buildChatContext} />
      {profile && <SosButton userId={profile.uid} userName={profile.name} role="driver" busId={myBus?.busId ?? null} />}

      {/* ── Report modal ── */}
      {reportType && (
        <div className="modal-backdrop" onClick={() => !reportSaving && setReportType(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">{reportType === 'incident' ? 'Report Incident' : 'Report Damage'}</h2>
            <form onSubmit={handleSubmitReport}>
              <Select
                label="Category"
                value={reportForm.category}
                onChange={(e) => setReportForm({ ...reportForm, category: e.target.value })}
                options={(reportType === 'incident' ? INCIDENT_CATEGORIES : DAMAGE_CATEGORIES).map((c) => ({ value: c, label: c }))}
                required
              />
              <div className="form-group">
                <label className="form-label">Details (optional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Anything else the admin should know…"
                  value={reportForm.description}
                  onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="secondary" onClick={() => setReportType(null)} disabled={reportSaving}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={reportSaving} disabled={!reportForm.category}>
                  Send to admin
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverPanelPage;
