/**
 * Live map — students, professors (and any signed-in role) see every bus
 * moving in real time. Data streams straight from Firestore via useBuses.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar, LoadingSpinner, Button, MobileBottomNav, type BottomNavTab } from '../components/common';
import { BusMap, isFresh } from '../components/BusMap';
import { ChatAssistant, type ChatAssistantHandle } from '../components/ChatAssistant';
import { SosButton } from '../components/SosButton';
import { NotificationBell, type NotificationBellHandle } from '../components/NotificationBell';
import { useBuses } from '../hooks/useBuses';
import { useAuth } from '../context/AuthContext';
import { estimateEta } from '../utils/eta';
import { submitMissedBusRequest, subscribeToMyMissedBusRequests } from '../services/firestore';
import type { Bus, MissedBusRequest } from '../types';
import IconHome from '~icons/material-symbols/home-outline';
import IconMyLocation from '~icons/material-symbols/my-location-outline';
import IconBot from '~icons/material-symbols/smart-toy-outline';
import IconBell from '~icons/material-symbols/notifications-outline';
import IconPerson from '~icons/material-symbols/person-outline';
import IconBus from '~icons/material-symbols/directions-bus';
import IconClose from '~icons/material-symbols/close';

const statusOf = (bus: Bus): 'live' | 'stale' | 'offline' => {
  if (!bus.isActive) return 'offline';
  return isFresh(bus) ? 'live' : 'stale';
};

const STATUS_LABEL = { live: 'Live', stale: 'Signal lost', offline: 'Not on trip' } as const;
const STATUS_DOT_CLASS = { live: 'bg-green-600', stale: 'bg-amber-500', offline: 'bg-gray-400' } as const;

const StudentMapPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { buses, loading, error } = useBuses();
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [showBusList, setShowBusList] = useState(false);
  const chatRef = useRef<ChatAssistantHandle>(null);
  const bellRef = useRef<NotificationBellHandle>(null);

  const selectedBus = useMemo(
    () => buses.find((b) => b.busId === selectedBusId) ?? null,
    [buses, selectedBusId]
  );
  const liveCount = buses.filter((b) => statusOf(b) === 'live').length;
  const isRider = profile?.role === 'student' || profile?.role === 'professor';

  const myBus = useMemo(
    () => buses.find((b) => b.busId === profile?.assignedBusId) ?? null,
    [buses, profile]
  );
  const myStop = useMemo(
    () => myBus?.stops?.find((s) => s.name === profile?.assignedStopName) ?? null,
    [myBus, profile]
  );
  const myEta = useMemo(
    () => (myBus?.lastLocation && myStop ? estimateEta(myBus.lastLocation, myStop, myBus.routePath) : null),
    [myBus, myStop]
  );

  // Missed Bus Recovery (PROJECT_SPEC.md sections 2 + 4)
  const [myMissedBusRequests, setMyMissedBusRequests] = useState<MissedBusRequest[]>([]);
  const [showMissedBusModal, setShowMissedBusModal] = useState(false);
  const [missedBusSaving, setMissedBusSaving] = useState(false);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = subscribeToMyMissedBusRequests(profile.uid, setMyMissedBusRequests);
    return unsub;
  }, [profile?.uid]);

  const hasPendingMissedBusRequest = myMissedBusRequests.some((r) => r.status === 'pending');

  const alternativeBuses = useMemo(() => {
    if (!myBus) return [];
    return buses
      .filter((b) => b.busId !== myBus.busId && b.isActive && b.lastLocation)
      .map((b) => ({ bus: b, availableSeats: Math.max(0, (b.capacity || 0) - (b.boardedStudentIds?.length ?? 0)) }))
      .filter((b) => b.availableSeats > 0)
      .sort((a, b) => b.availableSeats - a.availableSeats);
  }, [buses, myBus]);

  const handleRequestAlternative = async (altBusId: string, altBusNumber: string) => {
    if (!profile || !myBus) return;
    setMissedBusSaving(true);
    try {
      await submitMissedBusRequest({
        studentId: profile.uid,
        studentName: profile.name,
        originalBusId: myBus.busId,
        requestedBusId: altBusId,
        requestedBusNumber: altBusNumber,
      });
      setShowMissedBusModal(false);
    } finally {
      setMissedBusSaving(false);
    }
  };

  // Jump straight to the student's own bus the first time it's known —
  // they can still pick a different one afterward without being overridden.
  const [autoSelected, setAutoSelected] = useState(false);
  useEffect(() => {
    if (!autoSelected && profile?.assignedBusId) {
      setSelectedBusId(profile.assignedBusId);
      setAutoSelected(true);
    }
  }, [autoSelected, profile]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const buildChatContext = () => ({
    studentName: profile?.name,
    assignedBus: myBus ? { busId: myBus.busId, routeName: myBus.routeName, isActive: myBus.isActive } : null,
    assignedStopName: profile?.assignedStopName ?? null,
    etaToMyStop: myEta ? { status: myEta.status, etaMinutes: myEta.etaMinutes, approximate: myEta.approximate } : null,
    missedBusAlternatives: alternativeBuses.map(({ bus, availableSeats }) => ({ busId: bus.busId, routeName: bus.routeName, availableSeats })),
    allBuses: buses.map((b) => ({ busId: b.busId, routeName: b.routeName, isActive: b.isActive })),
  });

  const myBusStatusText = !profile?.assignedBusId || !myBus
    ? 'Not assigned yet — contact the transport office'
    : !myBus.isActive
    ? `${myBus.busId} · not on a trip right now`
    : !myBus.lastLocation
    ? `${myBus.busId} · waiting for GPS…`
    : !myStop
    ? `${myBus.busId} · on a trip`
    : myEta?.status === 'passed'
    ? `Already passed ${myStop.name}`
    : myEta?.status === 'arriving'
    ? `Arriving now at ${myStop.name}`
    : `${myEta?.approximate ? '~' : ''}${myEta?.etaMinutes} min to ${myStop.name}`;

  const bottomTabs: BottomNavTab[] = [
    { key: 'home', icon: IconHome, label: 'Home', to: '/map' },
    { key: 'track', icon: IconMyLocation, label: 'Track', to: '/map' },
    { key: 'ai', icon: IconBot, label: 'AI', onClick: () => chatRef.current?.open() },
    { key: 'alerts', icon: IconBell, label: 'Alerts', onClick: () => bellRef.current?.open() },
    { key: 'profile', icon: IconPerson, label: 'Profile', onClick: handleLogout },
  ];

  return (
    <div className="fixed inset-0 flex flex-col bg-surface overflow-hidden">
      {error && (
        <div className="bg-error-container text-on-error-container text-center text-label-md py-xs px-md shrink-0">
          {error}
        </div>
      )}

      <Navbar
        title="ACT To Go"
        subtitle={liveCount ? `${liveCount} bus${liveCount === 1 ? '' : 'es'} live now` : 'No buses live right now'}
        rightAction={
          <>
            <NotificationBell ref={bellRef} />
            {profile?.role === 'driver' && (
              <Button variant="secondary" size="sm" onClick={() => navigate('/driver')}>Driver Panel</Button>
            )}
            {profile?.role === 'admin' && (
              <Button variant="secondary" size="sm" onClick={() => navigate('/admin')}>Dashboard</Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
          </>
        }
      />

      <div className="relative flex-1 min-h-0">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <LoadingSpinner label="Connecting to live bus data…" />
          </div>
        ) : (
          <div className="absolute inset-0">
            <BusMap
              buses={buses}
              selectedBusId={selectedBusId}
              onSelectBus={setSelectedBusId}
              follow={follow && !!selectedBus}
            />
          </div>
        )}
      </div>

      {/* ── Bottom sheet: My Bus / selected bus detail ── */}
      {!loading && (
        <div className="shrink-0 bg-surface-container-lowest border-t border-outline-variant rounded-t-2xl shadow-overlay max-h-[42vh] overflow-y-auto">
          <div className="w-9 h-1 bg-outline-variant rounded-full mx-auto mt-sm" />

          {/* Quick bus-browser row */}
          <div className="px-md pt-sm">
            <button
              className="flex items-center gap-xs text-label-md text-on-surface-variant font-bold uppercase tracking-wider mb-xs"
              onClick={() => setShowBusList((v) => !v)}
            >
              <IconBus className="w-4 h-4" /> All buses ({buses.length})
            </button>
            {showBusList && (
              <div className="flex gap-sm overflow-x-auto pb-sm mb-xs">
                {buses.map((bus) => {
                  const s = statusOf(bus);
                  return (
                    <button
                      key={bus.busId}
                      onClick={() => { setSelectedBusId(bus.busId === selectedBusId ? null : bus.busId); setFollow(true); }}
                      className={`shrink-0 flex items-center gap-xs px-md py-sm rounded-lg border text-label-md ${
                        bus.busId === selectedBusId
                          ? 'border-primary bg-primary-fixed text-on-primary-fixed'
                          : 'border-outline-variant text-on-surface'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${STATUS_DOT_CLASS[s]}`} />
                      {bus.busNumber}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedBus ? (
            <div className="px-md pb-md">
              <div className="flex items-center gap-sm mb-sm">
                <span className="font-title-lg text-title-lg text-on-surface flex-1">
                  {selectedBus.busNumber} · {selectedBus.busName}
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT_CLASS[statusOf(selectedBus)]}`} />
              </div>
              <dl className="grid grid-cols-2 gap-sm text-body-md mb-md">
                <div><dt className="text-label-md text-on-surface-variant">Status</dt><dd>{STATUS_LABEL[statusOf(selectedBus)]}</dd></div>
                <div><dt className="text-label-md text-on-surface-variant">Route</dt><dd>{selectedBus.routeName || '—'}</dd></div>
                <div className="col-span-2"><dt className="text-label-md text-on-surface-variant">From → To</dt><dd>{selectedBus.origin || '—'} → {selectedBus.destination || '—'}</dd></div>
                <div><dt className="text-label-md text-on-surface-variant">Driver</dt><dd>{selectedBus.activeDriverName ?? 'Not on trip'}</dd></div>
                <div><dt className="text-label-md text-on-surface-variant">Speed</dt><dd>{selectedBus.lastLocation?.speedKmh != null ? `${Math.round(selectedBus.lastLocation.speedKmh)} km/h` : '—'}</dd></div>
              </dl>
              <div className="flex gap-sm">
                <Button size="sm" variant={follow ? 'primary' : 'secondary'} onClick={() => setFollow((f) => !f)}>
                  <IconMyLocation className="w-4 h-4" /> {follow ? 'Following' : 'Follow bus'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedBusId(null)}>
                  <IconClose className="w-4 h-4" /> Close
                </Button>
              </div>
            </div>
          ) : isRider ? (
            <div className="px-md pb-md">
              <span className="font-label-md text-label-md text-secondary uppercase tracking-wider">Live Prediction</span>
              <h2 className="font-headline-md text-title-lg text-on-surface mt-xs mb-xs">
                {myStop?.name ?? 'Your stop'}
              </h2>
              <p className="text-body-md text-on-surface-variant mb-md">{myBusStatusText}</p>
              {myEta?.status === 'passed' && !hasPendingMissedBusRequest && (
                <Button size="sm" onClick={() => setShowMissedBusModal(true)}>Missed your bus?</Button>
              )}
              {hasPendingMissedBusRequest && (
                <span className="inline-flex px-sm py-xs rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-label-md">
                  Alternative bus requested…
                </span>
              )}
            </div>
          ) : (
            <div className="px-md pb-md text-body-md text-on-surface-variant">
              Tap "All buses" above, or a bus on the map, to see its live details.
            </div>
          )}
        </div>
      )}

      {isRider && (
        <MobileBottomNav tabs={bottomTabs} />
      )}

      {isRider && profile && (
        <>
          <ChatAssistant ref={chatRef} hideTrigger title="Travel Assistant" examplePrompt="When will my bus arrive?" buildContext={buildChatContext} />
          <SosButton userId={profile.uid} userName={profile.name} role={profile.role as 'student' | 'professor'} busId={myBus?.busId ?? null} />
        </>
      )}

      {/* ── Missed bus modal ── */}
      {showMissedBusModal && myBus && (
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center" onClick={() => !missedBusSaving && setShowMissedBusModal(false)}>
          <div className="bg-surface-container-lowest rounded-t-2xl sm:rounded-xl w-full sm:max-w-md p-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-title-lg text-title-lg text-on-surface mb-xs">Missed {myBus.busId}?</h2>
            <p className="text-body-md text-on-surface-variant mb-md">
              Pick a bus that's currently running with free seats. The admin approves it before it's official.
            </p>
            {alternativeBuses.length === 0 ? (
              <p className="text-body-md text-on-surface-variant mb-md">No other bus is running with free seats right now.</p>
            ) : (
              <div className="flex flex-col gap-sm mb-md">
                {alternativeBuses.map(({ bus, availableSeats }) => (
                  <div key={bus.busId} className="flex items-center justify-between gap-sm p-sm rounded-lg bg-surface-container-low border border-outline-variant">
                    <span className="text-body-md">
                      <strong>{bus.busId}</strong>
                      <span className="text-on-surface-variant"> · {bus.routeName || bus.busName} · {availableSeats} seats free</span>
                    </span>
                    <Button size="sm" isLoading={missedBusSaving} onClick={() => handleRequestAlternative(bus.busId, bus.busNumber)}>
                      Request
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setShowMissedBusModal(false)} disabled={missedBusSaving}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentMapPage;
