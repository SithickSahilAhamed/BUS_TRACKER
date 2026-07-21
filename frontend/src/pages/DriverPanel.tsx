/**
 * DRIVER PANEL
 * Driver signs in with their own account, picks the bus they're driving,
 * starts the trip, and their phone GPS streams to Firestore (throttled).
 * The GPS watch itself lives in services/tracking.ts, not in this
 * component — so navigating to another page (e.g. "View map") and back
 * doesn't pause it. Only End Trip / Logout stop it.
 */

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Navbar, Button, Select, Textarea, MobileBottomNav, type BottomNavTab } from '../components/common';
import { ChatAssistant, type ChatAssistantHandle } from '../components/ChatAssistant';
import { SosButton } from '../components/SosButton';
import { NotificationBell, type NotificationBellHandle } from '../components/NotificationBell';
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
import IconHome from '~icons/material-symbols/home-outline';
import IconMyLocation from '~icons/material-symbols/my-location-outline';
import IconBot from '~icons/material-symbols/smart-toy-outline';
import IconBell from '~icons/material-symbols/notifications-outline';
import IconPerson from '~icons/material-symbols/person-outline';
import IconPlay from '~icons/material-symbols/play-circle';
import IconStop from '~icons/material-symbols/stop-circle';
import IconGroup from '~icons/material-symbols/group';
import IconWheelchair from '~icons/material-symbols/wheelchair-pickup';
import IconReport from '~icons/material-symbols/report';
import IconCrash from '~icons/material-symbols/minor-crash';
import IconSensors from '~icons/material-symbols/sensors';

const isNativeApp = Capacitor.isNativePlatform();

export const DriverPanelPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();
  const { buses, loading: busesLoading } = useBuses();
  const tracking = useSyncExternalStore(subscribeTracking, getTrackingState);
  const chatRef = useRef<ChatAssistantHandle>(null);
  const bellRef = useRef<NotificationBellHandle>(null);

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

  const buildChatContext = () => ({
    driverName: profile?.name,
    tripStatus: isTracking ? 'on trip, GPS broadcasting' : myBus ? 'has a claimed bus but not currently tracking' : 'not on a trip',
    currentBus: myBus ? { busId: myBus.busId, routeName: myBus.routeName } : null,
    nextStop: nextStop
      ? { name: nextStop.name, waitingCount: stopRiders.length - boardedCount, boardedCount, totalAssignedHere: stopRiders.length }
      : null,
  });

  const bottomTabs: BottomNavTab[] = [
    { key: 'home', icon: IconHome, label: 'Home', to: '/driver' },
    { key: 'track', icon: IconMyLocation, label: 'Track', to: '/map' },
    { key: 'ai', icon: IconBot, label: 'AI', onClick: () => chatRef.current?.open() },
    { key: 'alerts', icon: IconBell, label: 'Alerts', onClick: () => bellRef.current?.open() },
    { key: 'profile', icon: IconPerson, label: 'Profile', onClick: handleLogout },
  ];

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <Navbar
        title="Driver Panel"
        subtitle={profile ? profile.name : 'Agni College of Technology'}
        rightAction={<NotificationBell ref={bellRef} />}
      />

      <main className="flex-1 flex flex-col gap-md p-gutter pb-32 max-w-lg mx-auto w-full">
        {error && (
          <div className="p-sm rounded-lg bg-error-container text-on-error-container text-body-md flex items-center justify-between gap-sm">
            {error}
            <button className="font-bold shrink-0" onClick={() => setError(null)}>✕</button>
          </div>
        )}
        {success && (
          <div className="p-sm rounded-lg bg-green-100 text-green-800 text-body-md flex items-center justify-between gap-sm">
            {success}
            <button className="font-bold shrink-0" onClick={() => setSuccess(null)}>✕</button>
          </div>
        )}

        {/* GPS streaming status ribbon */}
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex items-center justify-between">
          <div className="flex items-center gap-sm">
            <span className={`w-2.5 h-2.5 rounded-full ${isTracking ? 'bg-secondary animate-pulse' : 'bg-gray-400'}`} />
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              {isTracking ? 'GPS Streaming Active' : 'GPS Idle'}
            </span>
          </div>
          <span className="font-mono-data text-mono-data text-primary">
            {isTracking ? `${tracking.busId} · ${tracking.writeCount} updates sent` : 'Not on a trip'}
          </span>
        </section>

        {/* Active claim from a previous session (in-app navigation no longer loses tracking state) */}
        {myBus && !isTracking && (
          <div className="p-md rounded-xl bg-tertiary-fixed text-on-tertiary-fixed-variant flex items-center justify-between gap-sm">
            <span>You still have an active trip on <strong>{myBus.busId}</strong>.</span>
            <span className="flex gap-sm shrink-0">
              <Button size="sm" onClick={handleResumeTracking}>Resume</Button>
              <Button size="sm" variant="danger" onClick={handleEndTrip}>End trip</Button>
            </span>
          </div>
        )}

        {!isTracking && !myBus && (
          <section className="flex flex-col gap-md">
            <Select
              label="Which bus are you driving?"
              value={selectedBusId}
              onChange={(e) => setSelectedBusId(e.target.value)}
              disabled={busesLoading}
              options={buses.map((bus) => ({
                value: bus.busId,
                label: `${bus.busId} · ${bus.busName}${claimedElsewhere(bus.busId) ? ` (in use by ${bus.activeDriverName})` : ''}`,
              }))}
            />
            {gpsAvailable === false && (
              <div className="p-sm rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant text-body-md">
                GPS not available on this device. Turn on location services in your phone settings, then reload this page.
              </div>
            )}
            <button
              className="relative w-full h-40 bg-primary rounded-2xl flex flex-col items-center justify-center gap-xs text-on-primary transition-all active:scale-[0.98] disabled:opacity-50"
              disabled={!selectedBusId || isBusy}
              onClick={handleStartTrip}
            >
              <IconPlay className="w-14 h-14" />
              <span className="font-headline-lg-mobile text-headline-lg-mobile font-black tracking-tight">
                {isBusy ? 'Starting…' : 'Start Trip'}
              </span>
              {selectedBusId && <span className="font-label-md text-label-md opacity-70">Tap to claim {selectedBusId}</span>}
            </button>
          </section>
        )}

        {isTracking && (
          <section className="flex flex-col gap-md">
            <button
              className="w-full h-40 bg-error rounded-2xl flex flex-col items-center justify-center gap-xs text-on-error transition-all active:scale-[0.98] disabled:opacity-50"
              disabled={isBusy}
              onClick={handleEndTrip}
            >
              <IconStop className="w-14 h-14" />
              <span className="font-headline-lg-mobile text-headline-lg-mobile font-black tracking-tight">
                {isBusy ? 'Ending…' : 'End Trip'}
              </span>
            </button>

            <div className="grid grid-cols-3 gap-sm">
              <div className="bg-surface-container-low rounded-lg p-sm text-center">
                <div className="text-label-md text-on-surface-variant">Latitude</div>
                <div className="font-mono-data text-mono-data text-on-surface">{tracking.current ? tracking.current.lat.toFixed(4) : '—'}</div>
              </div>
              <div className="bg-surface-container-low rounded-lg p-sm text-center">
                <div className="text-label-md text-on-surface-variant">Longitude</div>
                <div className="font-mono-data text-mono-data text-on-surface">{tracking.current ? tracking.current.lng.toFixed(4) : '—'}</div>
              </div>
              <div className="bg-surface-container-low rounded-lg p-sm text-center">
                <div className="text-label-md text-on-surface-variant">Speed</div>
                <div className="font-mono-data text-mono-data text-on-surface">{tracking.speed != null ? `${tracking.speed.toFixed(0)} km/h` : '—'}</div>
              </div>
            </div>

            {tracking.error && (
              <div className="p-sm rounded-lg bg-error-container text-on-error-container text-body-md">⚠ {tracking.error}</div>
            )}
            {!tracking.error && !tracking.current && (
              <div className="p-sm rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant text-body-md">⚠ Waiting for a GPS fix…</div>
            )}

            {isNativeApp ? (
              <div className="p-sm rounded-lg bg-green-100 text-green-800 text-body-md flex items-center gap-xs">
                <IconSensors className="w-4 h-4 shrink-0" /> Background tracking is active — you can lock your phone or switch apps and your location will keep sending until you press End Trip.
              </div>
            ) : (
              <div className="p-sm rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant text-body-md">
                ⚠ Keep this tab open and in the foreground while driving — switching to another app pauses GPS updates on most phones.
              </div>
            )}
          </section>
        )}

        {/* Next Stop / roster */}
        {myBus && (
          <div className="bg-surface-container-low rounded-xl p-lg border border-outline-variant flex flex-col gap-sm">
            <div className="flex justify-between items-start">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase">
                {nextStop ? `Next Stop: ${nextStop.name}` : 'No more stops ahead'}
              </span>
              <IconGroup className="w-5 h-5 text-primary" />
            </div>
            {nextStop && (
              <>
                <div className="flex items-baseline gap-xs">
                  <span className="font-display-lg text-display-lg text-primary">{boardedCount}/{stopRiders.length}</span>
                  <span className="font-title-lg text-title-lg text-on-surface-variant">Boarded</span>
                </div>
                {stopRiders.length === 0 ? (
                  <p className="text-body-md text-on-surface-variant">No students are assigned to this stop.</p>
                ) : (
                  <div className="flex flex-col gap-xs mt-xs">
                    {stopRiders.map((s) => {
                      const boarded = !!myBus.boardedStudentIds?.includes(s.uid);
                      return (
                        <label
                          key={s.uid}
                          className="flex items-center gap-sm px-sm py-xs rounded-lg bg-surface-container-lowest border border-outline-variant text-body-md"
                          style={{ cursor: boardingBusy ? 'wait' : 'pointer' }}
                        >
                          <input
                            type="checkbox"
                            checked={boarded}
                            disabled={boardingBusy === s.uid}
                            onChange={(e) => handleToggleBoarded(s.uid, e.target.checked)}
                          />
                          <span className={`flex-1 ${boarded ? 'line-through opacity-60' : ''}`}>{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="mt-xs pt-xs border-t border-outline-variant flex gap-md">
                  <div className="flex items-center gap-xs text-label-md">
                    <IconWheelchair className="w-4 h-4" /> Accessible boarding available
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Reporting actions */}
        <div className="grid grid-cols-2 gap-md">
          <button
            className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col items-center justify-center gap-xs hover:bg-surface-container-high transition-colors active:scale-95"
            onClick={() => openReportModal('incident')}
          >
            <IconReport className="w-6 h-6 text-error" />
            <span className="font-label-md text-label-md font-semibold">Incident</span>
          </button>
          <button
            className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex flex-col items-center justify-center gap-xs hover:bg-surface-container-high transition-colors active:scale-95"
            onClick={() => openReportModal('damage')}
          >
            <IconCrash className="w-6 h-6 text-on-surface-variant" />
            <span className="font-label-md text-label-md font-semibold">Damage</span>
          </button>
        </div>

        {/* AI assistant entry point */}
        <button
          onClick={() => chatRef.current?.open()}
          className="bg-primary-container text-on-primary-container rounded-xl p-lg flex gap-md items-start text-left relative overflow-hidden"
        >
          <div className="p-xs bg-primary rounded-full shrink-0">
            <IconBot className="w-5 h-5 text-on-primary" />
          </div>
          <div className="flex flex-col gap-xs">
            <span className="font-label-md text-label-md font-bold uppercase tracking-widest opacity-80">Driver Assistant</span>
            <p className="font-body-md text-body-md leading-relaxed">
              Ask about your next stop, how many students are waiting, or your trip status.
            </p>
          </div>
        </button>
      </main>

      <MobileBottomNav tabs={bottomTabs} />
      <SosButton
        userId={profile?.uid ?? ''}
        userName={profile?.name ?? ''}
        role="driver"
        busId={myBus?.busId ?? null}
      />
      <ChatAssistant ref={chatRef} hideTrigger title="Driver Assistant" examplePrompt="Which stop has the most students waiting?" buildContext={buildChatContext} />

      {/* ── Report modal ── */}
      {reportType && (
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center" onClick={() => !reportSaving && setReportType(null)}>
          <div className="bg-surface-container-lowest rounded-t-2xl sm:rounded-xl w-full sm:max-w-md p-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-title-lg text-title-lg text-on-surface mb-md">
              {reportType === 'incident' ? 'Report Incident' : 'Report Damage'}
            </h2>
            <form onSubmit={handleSubmitReport}>
              <Select
                label="Category"
                value={reportForm.category}
                onChange={(e) => setReportForm({ ...reportForm, category: e.target.value })}
                options={(reportType === 'incident' ? INCIDENT_CATEGORIES : DAMAGE_CATEGORIES).map((c) => ({ value: c, label: c }))}
                required
              />
              <Textarea
                label="Details (optional)"
                rows={3}
                placeholder="Anything else the admin should know…"
                value={reportForm.description}
                onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
              />
              <div className="flex gap-sm justify-end">
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
