/**
 * PARENT PANEL
 * Parent role (PROJECT_SPEC.md sections 1.3 + 4): tracks their linked
 * child's assigned bus live, same map/ETA machinery as the student
 * experience. Admin sets the link (users/{parentUid}.linkedStudentUid) —
 * see AdminDashboard's Drivers page "Parents" section.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar, LoadingSpinner } from '../components/common';
import { BusMap, isFresh } from '../components/BusMap';
import { NotificationBell } from '../components/NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useBuses } from '../hooks/useBuses';
import { subscribeToUserProfile } from '../services/firestore';
import { estimateEta } from '../utils/eta';
import type { UserProfile } from '../types';

const ParentPanelPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { buses, loading } = useBuses();
  const [child, setChild] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!profile?.linkedStudentUid) { setChild(null); return; }
    return subscribeToUserProfile(profile.linkedStudentUid, setChild);
  }, [profile?.linkedStudentUid]);

  const childBus = useMemo(
    () => buses.find((b) => b.busId === child?.assignedBusId) ?? null,
    [buses, child]
  );
  const childStop = useMemo(
    () => childBus?.stops?.find((s) => s.name === child?.assignedStopName) ?? null,
    [childBus, child]
  );
  const eta = useMemo(
    () => (childBus?.lastLocation && childStop ? estimateEta(childBus.lastLocation, childStop, childBus.routePath) : null),
    [childBus, childStop]
  );

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="map-wrapper">
      <Navbar
        title="Parent Panel"
        subtitle={child ? `Tracking ${child.name}` : 'Agni College of Technology'}
        rightAction={
          <>
            <NotificationBell />
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
          </>
        }
      />

      <div className="map-container">
        {loading ? (
          <div className="full-center" style={{ minHeight: '100%' }}>
            <LoadingSpinner label="Connecting…" />
          </div>
        ) : !profile?.linkedStudentUid ? (
          <div className="full-center" style={{ minHeight: '100%' }}>
            <p style={{ color: 'var(--text-muted)' }}>
              No child is linked to your account yet — contact the transport office.
            </p>
          </div>
        ) : (
          <>
            <BusMap buses={buses} selectedBusId={childBus?.busId ?? null} follow={!!childBus} />

            <div className="map-top-bar">
              <span style={{ fontWeight: 600 }}>🚌 {child?.name}'s Bus</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {!child?.assignedBusId || !childBus
                  ? 'Not assigned to a bus yet'
                  : !childBus.isActive
                  ? `${childBus.busId} · not on a trip right now`
                  : !childBus.lastLocation
                  ? `${childBus.busId} · waiting for GPS…`
                  : !childStop
                  ? `${childBus.busId} · on a trip`
                  : eta?.status === 'passed'
                  ? `${childBus.busId} · already passed ${childStop.name}`
                  : eta?.status === 'arriving'
                  ? `${childBus.busId} · arriving now at ${childStop.name}`
                  : `${childBus.busId} · ${eta?.approximate ? '~' : ''}${eta?.etaMinutes} min to ${childStop.name}`}
              </span>
            </div>

            <div className="map-panel map-panel-left">
              <div className="card-header" style={{ marginBottom: '.5rem' }}>Contact Transport Office</div>
              <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
                For questions about {child?.name}'s transport, contact the college transport office directly.
              </p>
              {childBus && (
                <div className="info-row">
                  <span className="label">Status</span>
                  <span className="value">{childBus.isActive ? (isFresh(childBus) ? 'Live' : 'Signal lost') : 'Not on trip'}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ParentPanelPage;
