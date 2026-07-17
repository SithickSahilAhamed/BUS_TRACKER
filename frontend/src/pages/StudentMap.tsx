/**
 * Live map — students, professors (and any signed-in role) see every bus
 * moving in real time. Data streams straight from Firestore via useBuses.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar, LoadingSpinner } from '../components/common';
import { BusMap, isFresh } from '../components/BusMap';
import { useBuses } from '../hooks/useBuses';
import { useAuth } from '../context/AuthContext';
import { estimateEta } from '../utils/eta';
import type { Bus } from '../types';

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
    </div>
  );
};

export default StudentMapPage;
