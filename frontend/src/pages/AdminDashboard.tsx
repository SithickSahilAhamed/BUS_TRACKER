/**
 * ADMIN DASHBOARD
 * Fleet management on Firestore: buses (with geocoded OSM route), driver
 * accounts, and a live tracking map. Tab shown depends on the /admin/* path.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Alert, Badge } from '../components/common';
import { AdminSidebar } from '../components/admin/Sidebar';
import { BusMap, isFresh } from '../components/BusMap';
import { useAuth } from '../context/AuthContext';
import { useBuses } from '../hooks/useBuses';
import {
  createBus,
  updateBus,
  deleteBus,
  releaseBus,
  subscribeToDrivers,
  setDriverActive,
  createDriverAccount,
  normalizeBusId,
} from '../services/firestore';
import { buildRoute } from '../services/geo';
import type { Bus, UserProfile } from '../types';

// ─── Forms ────────────────────────────────────────────────────────────────────

interface BusForm {
  busNumber: string;
  busName: string;
  routeName: string;
  origin: string;
  destination: string;
  waypoints: string; // comma-separated in the UI
}

const EMPTY_BUS_FORM: BusForm = {
  busNumber: '', busName: '', routeName: '', origin: '', destination: '', waypoints: '',
};

interface DriverForm {
  name: string;
  phone: string;
  email: string;
  password: string;
}

const EMPTY_DRIVER_FORM: DriverForm = { name: '', phone: '', email: '', password: '' };

// ─── Component ────────────────────────────────────────────────────────────────

export const AdminDashboardPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const handleLogout = async () => {
    await logout();
    navigate('/');
  };
  const tab =
    location.pathname === '/admin/buses' ? 'buses'
    : location.pathname === '/admin/drivers' ? 'drivers'
    : location.pathname === '/admin/tracking' ? 'tracking'
    : 'overview';

  const { buses, loading: busesLoading } = useBuses();
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Bus modal
  const [showBusModal, setShowBusModal] = useState(false);
  const [editingBusId, setEditingBusId] = useState<string | null>(null);
  const [busForm, setBusForm] = useState<BusForm>(EMPTY_BUS_FORM);
  const [busSaving, setBusSaving] = useState(false);
  const [busSaveStatus, setBusSaveStatus] = useState('');

  // Driver modal
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [driverForm, setDriverForm] = useState<DriverForm>(EMPTY_DRIVER_FORM);
  const [driverSaving, setDriverSaving] = useState(false);

  // Tracking tab selection
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToDrivers(setDrivers, () =>
      setError('Could not load drivers. Are you signed in as admin?')
    );
    return unsub;
  }, []);

  // Auto-dismiss toasts
  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => { setSuccess(null); setError(null); }, 5000);
    return () => clearTimeout(t);
  }, [success, error]);

  const onTripCount = useMemo(() => buses.filter((b) => b.isActive).length, [buses]);
  const liveCount = useMemo(() => buses.filter((b) => b.isActive && isFresh(b)).length, [buses]);

  // ─── Bus handlers ───────────────────────────────────────────────────────────

  const openCreateBus = () => {
    setEditingBusId(null);
    setBusForm(EMPTY_BUS_FORM);
    setShowBusModal(true);
  };

  const openEditBus = (bus: Bus) => {
    setEditingBusId(bus.busId);
    setBusForm({
      busNumber: bus.busNumber,
      busName: bus.busName,
      routeName: bus.routeName,
      origin: bus.origin,
      destination: bus.destination,
      waypoints: bus.waypoints.join(', '),
    });
    setShowBusModal(true);
  };

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusSaving(true);
    setError(null);

    const waypoints = busForm.waypoints.split(',').map((w) => w.trim()).filter(Boolean);
    const input = {
      busNumber: busForm.busNumber,
      busName: busForm.busName,
      routeName: busForm.routeName,
      origin: busForm.origin,
      destination: busForm.destination,
      waypoints,
    };

    if (!editingBusId && buses.some((b) => b.busId === normalizeBusId(input.busNumber))) {
      setError(`Bus "${normalizeBusId(input.busNumber)}" already exists.`);
      setBusSaving(false);
      return;
    }

    // Geocode + road route (free OSM services, only hit on save)
    let routePath = null;
    let stops = null;
    if (input.origin && input.destination) {
      try {
        setBusSaveStatus('Finding places on the map… (a few seconds per stop)');
        const built = await buildRoute(input.origin, input.destination, waypoints);
        routePath = built.routePath;
        stops = built.stops;
      } catch (err: any) {
        const keepGoing = window.confirm(
          `${err?.message ?? 'Route lookup failed.'}\n\nSave the bus without a drawn route? You can edit it again later.`
        );
        if (!keepGoing) {
          setBusSaving(false);
          setBusSaveStatus('');
          return;
        }
      }
    }

    try {
      setBusSaveStatus('Saving…');
      if (editingBusId) {
        await updateBus(editingBusId, { ...input, routePath, stops });
        setSuccess(`Bus ${editingBusId} updated.`);
      } else {
        const id = await createBus({ ...input, routePath, stops });
        setSuccess(`Bus ${id} created.`);
      }
      setShowBusModal(false);
    } catch (err: any) {
      setError(err?.message ?? 'Saving the bus failed.');
    } finally {
      setBusSaving(false);
      setBusSaveStatus('');
    }
  };

  const handleDeleteBus = async (bus: Bus) => {
    if (!window.confirm(`Delete ${bus.busId} (${bus.busName})? This cannot be undone.`)) return;
    try {
      await deleteBus(bus.busId);
      setSuccess(`Bus ${bus.busId} deleted.`);
    } catch {
      setError('Deleting the bus failed.');
    }
  };

  const handleForceRelease = async (bus: Bus) => {
    if (!window.confirm(`End the current trip on ${bus.busId}? The driver will have to start again.`)) return;
    try {
      await releaseBus(bus.busId);
      setSuccess(`Trip on ${bus.busId} ended.`);
    } catch {
      setError('Could not end the trip.');
    }
  };

  // ─── Driver handlers ────────────────────────────────────────────────────────

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setDriverSaving(true);
    setError(null);
    try {
      await createDriverAccount(driverForm);
      setSuccess(`Driver account for ${driverForm.name} created. They can log in at /login now.`);
      setShowDriverModal(false);
      setDriverForm(EMPTY_DRIVER_FORM);
    } catch (err: any) {
      setError(
        err?.code === 'auth/email-already-in-use'
          ? 'That email already has an account.'
          : err?.message ?? 'Creating the driver failed.'
      );
    } finally {
      setDriverSaving(false);
    }
  };

  const handleToggleDriver = async (driver: UserProfile) => {
    try {
      await setDriverActive(driver.uid, !driver.active);
      setSuccess(`${driver.name} is now ${driver.active ? 'deactivated' : 'active'}.`);
    } catch {
      setError('Updating the driver failed.');
    }
  };

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const renderOverview = () => (
    <>
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Total buses</div>
          <div className="metric-value">{buses.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">On trip now</div>
          <div className="metric-value">{onTripCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Live GPS</div>
          <div className="metric-value">{liveCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Drivers</div>
          <div className="metric-value">{drivers.length}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Buses on trip</div>
        {onTripCount === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No bus is on a trip right now.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Bus</th><th>Route</th><th>Driver</th><th>GPS</th><th></th></tr>
              </thead>
              <tbody>
                {buses.filter((b) => b.isActive).map((bus) => (
                  <tr key={bus.busId}>
                    <td><strong>{bus.busId}</strong></td>
                    <td>{bus.routeName || '—'}</td>
                    <td>{bus.activeDriverName ?? '—'}</td>
                    <td>
                      {isFresh(bus)
                        ? <Badge variant="success">live</Badge>
                        : <Badge variant="warning">signal lost</Badge>}
                    </td>
                    <td>
                      <Button variant="danger" size="sm" onClick={() => handleForceRelease(bus)}>
                        End trip
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );

  const renderBuses = () => (
    <div className="panel">
      <div className="section-header">
        <div className="panel-title" style={{ marginBottom: 0 }}>Buses</div>
        <Button onClick={openCreateBus}>+ Add bus</Button>
      </div>
      {busesLoading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : buses.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          No buses yet. Add your first bus — e.g. bus number "BUS-1" with its route.
        </p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Bus</th><th>Name</th><th>Route</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {buses.map((bus) => (
                <tr key={bus.busId}>
                  <td><strong>{bus.busId}</strong></td>
                  <td>{bus.busName}</td>
                  <td>
                    {bus.origin && bus.destination
                      ? `${bus.origin} → ${bus.destination}`
                      : bus.routeName || '—'}
                    {!bus.routePath && bus.origin && (
                      <span title="No drawn route — edit and re-save to retry the map lookup"> ⚠️</span>
                    )}
                  </td>
                  <td>
                    {bus.isActive
                      ? <Badge variant="success">on trip · {bus.activeDriverName}</Badge>
                      : <Badge variant="info">idle</Badge>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Button variant="secondary" size="sm" onClick={() => openEditBus(bus)}>Edit</Button>{' '}
                    <Button variant="danger" size="sm" onClick={() => handleDeleteBus(bus)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderDrivers = () => (
    <div className="panel">
      <div className="section-header">
        <div className="panel-title" style={{ marginBottom: 0 }}>Drivers</div>
        <Button onClick={() => setShowDriverModal(true)}>+ Add driver</Button>
      </div>
      {drivers.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          No drivers yet. Create a driver account — they log in with it and pick the bus they're driving.
        </p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Driving now</th><th></th></tr>
            </thead>
            <tbody>
              {drivers.map((driver) => {
                const drivingBus = buses.find((b) => b.activeDriverId === driver.uid);
                return (
                  <tr key={driver.uid}>
                    <td><strong>{driver.name}</strong></td>
                    <td>{driver.email}</td>
                    <td>{driver.phone || '—'}</td>
                    <td>
                      {driver.active
                        ? <Badge variant="success">active</Badge>
                        : <Badge variant="danger">deactivated</Badge>}
                    </td>
                    <td>{drivingBus ? drivingBus.busId : '—'}</td>
                    <td>
                      <Button
                        variant={driver.active ? 'danger' : 'primary'}
                        size="sm"
                        onClick={() => handleToggleDriver(driver)}
                      >
                        {driver.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', marginTop: '1rem' }}>
        Deactivating stops a driver from starting trips. To fully block their login, also disable the
        user in Firebase console → Authentication.
      </p>
    </div>
  );

  const renderTracking = () => (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ height: 'calc(100vh - 180px)', minHeight: 420, position: 'relative' }}>
        <BusMap
          buses={buses}
          selectedBusId={selectedBusId}
          onSelectBus={setSelectedBusId}
          follow={!!selectedBusId}
        />
      </div>
    </div>
  );

  // ─── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div className="admin-shell">
      <AdminSidebar />
      <div className="admin-main">
        <div className="admin-topbar">
          <span className="admin-topbar-user" title={profile?.email}>
            {profile ? `${profile.name} · admin` : 'Admin'}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
        </div>
        <div className="admin-content">
          <div className="section-header">
            <h1 className="section-title">
              {tab === 'overview' && 'Dashboard'}
              {tab === 'buses' && 'Manage Buses'}
              {tab === 'drivers' && 'Manage Drivers'}
              {tab === 'tracking' && 'Live Tracking'}
            </h1>
            <span className="chip">
              <span className={`status-dot ${liveCount ? 'live' : 'offline'}`} />
              {liveCount} live · {onTripCount} on trip
            </span>
          </div>

          {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
          {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

          {tab === 'overview' && renderOverview()}
          {tab === 'buses' && renderBuses()}
          {tab === 'drivers' && renderDrivers()}
          {tab === 'tracking' && renderTracking()}
        </div>
      </div>

      {/* ── Bus modal ── */}
      {showBusModal && (
        <div className="modal-backdrop" onClick={() => !busSaving && setShowBusModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">{editingBusId ? `Edit ${editingBusId}` : 'Add a bus'}</h2>
            <form onSubmit={handleSaveBus}>
              <div className="form-group">
                <label className="form-label">Bus number (this is what the driver picks)</label>
                <input
                  className="form-control"
                  placeholder="e.g. BUS-1"
                  value={busForm.busNumber}
                  onChange={(e) => setBusForm({ ...busForm, busNumber: e.target.value })}
                  disabled={!!editingBusId}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Bus name</label>
                <input
                  className="form-control"
                  placeholder="e.g. Agni Express 1"
                  value={busForm.busName}
                  onChange={(e) => setBusForm({ ...busForm, busName: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Route name</label>
                <input
                  className="form-control"
                  placeholder="e.g. Navalur – Agni College"
                  value={busForm.routeName}
                  onChange={(e) => setBusForm({ ...busForm, routeName: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Starting point</label>
                <input
                  className="form-control"
                  placeholder='e.g. "Navalur, Chennai" — include the city for better matches'
                  value={busForm.origin}
                  onChange={(e) => setBusForm({ ...busForm, origin: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Destination</label>
                <input
                  className="form-control"
                  placeholder='e.g. "Agni College of Technology, Thalambur"'
                  value={busForm.destination}
                  onChange={(e) => setBusForm({ ...busForm, destination: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Stops along the way (comma-separated, optional)</label>
                <input
                  className="form-control"
                  placeholder="e.g. Padur, Kelambakkam"
                  value={busForm.waypoints}
                  onChange={(e) => setBusForm({ ...busForm, waypoints: e.target.value })}
                />
              </div>
              {busSaveStatus && (
                <p style={{ color: 'var(--primary)', fontSize: '.85rem', marginBottom: '.75rem' }}>
                  {busSaveStatus}
                </p>
              )}
              <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="secondary" onClick={() => setShowBusModal(false)} disabled={busSaving}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={busSaving}>
                  {editingBusId ? 'Save changes' : 'Create bus'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Driver modal ── */}
      {showDriverModal && (
        <div className="modal-backdrop" onClick={() => !driverSaving && setShowDriverModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">Add a driver</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '.88rem', marginBottom: '1rem' }}>
              This creates a login the driver uses in the app. Share the email and password with them.
            </p>
            <form onSubmit={handleCreateDriver}>
              <div className="form-group">
                <label className="form-label">Full name</label>
                <input
                  className="form-control"
                  placeholder="Driver's name"
                  value={driverForm.name}
                  onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input
                  className="form-control"
                  placeholder="Mobile number"
                  value={driverForm.phone}
                  onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email (their login)</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="driver1@act.edu.in"
                  value={driverForm.email}
                  onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password (min 6 characters)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Set a password for them"
                  value={driverForm.password}
                  onChange={(e) => setDriverForm({ ...driverForm, password: e.target.value })}
                  minLength={6}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="secondary" onClick={() => setShowDriverModal(false)} disabled={driverSaving}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={driverSaving}>Create driver</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboardPage;
