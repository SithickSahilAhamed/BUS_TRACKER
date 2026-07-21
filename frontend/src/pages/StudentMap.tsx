/**
 * Live map — students, professors (and any signed-in role) see every bus
 * moving in real time. Data streams straight from Firestore via useBuses.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar, LoadingSpinner, Button } from '../components/common';
import { BusMap, isFresh } from '../components/BusMap';
import { ChatAssistant } from '../components/ChatAssistant';
import { SosButton } from '../components/SosButton';
import { NotificationBell } from '../components/NotificationBell';
import { useBuses } from '../hooks/useBuses';
import { useAuth } from '../context/AuthContext';
import { estimateEta } from '../utils/eta';
import { submitMissedBusRequest, subscribeToMyMissedBusRequests } from '../services/firestore';
import type { Bus, MissedBusRequest } from '../types';

const statusOf = (bus: Bus): 'live' | 'stale' | 'offline' => {
  if (!bus.isActive) return 'offline';
  return isFresh(bus) ? 'live' : 'stale';
};

const statusLabel = { live: 'Live', stale: 'Signal lost', offline: 'Not on trip' } as const;

const StudentMapPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { buses, loading, error } = useBuses();
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);

  const selectedBus = useMemo(
    () => buses.find((b) => b.busId === selectedBusId) ?? null,
    [buses, selectedBusId]
  );
  const liveCount = buses.filter((b) => statusOf(b) === 'live').length;

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

  // Other active buses with free seats right now — capacity minus who's
  // actually boarded, since occupancy for a bus nobody's assigned-count
  // reflects isn't the point here; what's free on the bus running past you is.
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

  return (
    <div className="map-wrapper">
      <Navbar
        title="Live Bus Map"
        subtitle="Agni College of Technology"
        rightAction={
          <>
            <span className={`chip ${liveCount ? '' : 'offline'}`}>
              <span className={`status-dot ${liveCount ? 'live' : 'offline'}`} />
              {liveCount} live now
            </span>
            <NotificationBell />
            {profile && (
              <span className="chip" title={profile.email}>
                {profile.name.split(' ')[0]} · {profile.role}
              </span>
            )}
            {profile?.role === 'driver' && (
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/driver')}>
                Driver Panel
              </button>
            )}
            {profile?.role === 'admin' && (
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin')}>
                Dashboard
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </>
        }
      />

      <div className="map-container">
        {loading ? (
          <div className="full-center" style={{ minHeight: '100%' }}>
            <LoadingSpinner label="Connecting to live bus data…" />
          </div>
        ) : (
          <>
            <BusMap
              buses={buses}
              selectedBusId={selectedBusId}
              onSelectBus={setSelectedBusId}
              follow={follow && !!selectedBus}
            />

            {/* My Bus banner — only meaningful for riders, not drivers/admins viewing the map */}
            {(profile?.role === 'student' || profile?.role === 'professor') && (
              <div className="map-top-bar" onClick={() => myBus && setSelectedBusId(myBus.busId)} style={{ cursor: myBus ? 'pointer' : 'default' }}>
                <span style={{ fontWeight: 600 }}>🚌 My Bus</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {!profile?.assignedBusId || !myBus
                    ? 'Not assigned yet — contact the transport office'
                    : !myBus.isActive
                    ? `${myBus.busId} · not on a trip right now`
                    : !myBus.lastLocation
                    ? `${myBus.busId} · waiting for GPS…`
                    : !myStop
                    ? `${myBus.busId} · on a trip`
                    : myEta?.status === 'passed'
                    ? `${myBus.busId} · already passed ${myStop.name}`
                    : myEta?.status === 'arriving'
                    ? `${myBus.busId} · arriving now at ${myStop.name}`
                    : `${myBus.busId} · ${myEta?.approximate ? '~' : ''}${myEta?.etaMinutes} min to ${myStop.name}`}
                </span>
                {myEta?.status === 'passed' && !hasPendingMissedBusRequest && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={(e) => { e.stopPropagation(); setShowMissedBusModal(true); }}
                  >
                    Missed your bus?
                  </button>
                )}
                {hasPendingMissedBusRequest && <span className="chip">Alternative bus requested…</span>}
              </div>
            )}

            {/* Bus list panel */}
            <div className="map-panel map-panel-right">
              <div className="card-header" style={{ marginBottom: '.5rem' }}>
                🚌 Buses ({buses.length})
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: '.85rem' }}>{error}</p>}
              {!buses.length && !error && (
                <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>
                  No buses have been added yet.
                </p>
              )}
              <div className="bus-list">
                {buses.map((bus) => {
                  const s = statusOf(bus);
                  return (
                    <div
                      key={bus.busId}
                      className={`bus-list-item ${bus.busId === selectedBusId ? 'selected' : ''}`}
                      onClick={() =>
                        setSelectedBusId(bus.busId === selectedBusId ? null : bus.busId)
                      }
                    >
                      <span style={{ fontWeight: 600 }}>{bus.busNumber}</span>
                      <span style={{ color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bus.routeName || bus.busName}
                      </span>
                      <span className={`status-dot ${s}`} title={statusLabel[s]} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected bus details */}
            {selectedBus && (
              <div className="map-panel map-panel-left">
                <div className="card-header" style={{ marginBottom: '.5rem' }}>
                  {selectedBus.busNumber} · {selectedBus.busName}
                  <span className={`status-dot ${statusOf(selectedBus)}`} style={{ marginLeft: 'auto' }} />
                </div>
                <div className="info-row">
                  <span className="label">Status</span>
                  <span className="value">{statusLabel[statusOf(selectedBus)]}</span>
                </div>
                <div className="info-row">
                  <span className="label">Route</span>
                  <span className="value">{selectedBus.routeName || '—'}</span>
                </div>
                <div className="info-row">
                  <span className="label">From → To</span>
                  <span className="value">
                    {selectedBus.origin || '—'} → {selectedBus.destination || '—'}
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Driver</span>
                  <span className="value">{selectedBus.activeDriverName ?? 'Not on trip'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Speed</span>
                  <span className="value">
                    {selectedBus.lastLocation?.speedKmh != null
                      ? `${Math.round(selectedBus.lastLocation.speedKmh)} km/h`
                      : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
                  <button
                    className={`btn btn-sm ${follow ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setFollow((f) => !f)}
                  >
                    {follow ? '📍 Following' : 'Follow bus'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedBusId(null)}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {(profile?.role === 'student' || profile?.role === 'professor') && profile && (
        <>
          <ChatAssistant title="Travel Assistant" examplePrompt="When will my bus arrive?" buildContext={buildChatContext} />
          <SosButton userId={profile.uid} userName={profile.name} role={profile.role as 'student' | 'professor'} busId={myBus?.busId ?? null} />
        </>
      )}

      {/* ── Missed bus modal ── */}
      {showMissedBusModal && myBus && (
        <div className="modal-backdrop" onClick={() => !missedBusSaving && setShowMissedBusModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">Missed {myBus.busId}?</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '.88rem', marginBottom: '1rem' }}>
              Pick a bus that's currently running with free seats. The admin approves it before it's official.
            </p>
            {alternativeBuses.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No other bus is running with free seats right now.</p>
            ) : (
              <div style={{ display: 'grid', gap: '.5rem', marginBottom: '1rem' }}>
                {alternativeBuses.map(({ bus, availableSeats }) => (
                  <div
                    key={bus.busId}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '.6rem .75rem', borderRadius: 'var(--radius)',
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                    }}
                  >
                    <span>
                      <strong>{bus.busId}</strong>
                      <span style={{ color: 'var(--text-muted)' }}> · {bus.routeName || bus.busName} · {availableSeats} seats free</span>
                    </span>
                    <Button size="sm" isLoading={missedBusSaving} onClick={() => handleRequestAlternative(bus.busId, bus.busNumber)}>
                      Request
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
