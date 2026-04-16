/**
 * ADMIN DASHBOARD
 * Fleet management: buses (with route config), drivers, live stats
 * Route config uses origin/destination/waypoints for Google Maps Directions API
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar, Button, Alert, Badge } from '../components/common';
import { AdminSidebar } from '../components/admin/Sidebar';
import { useSocketListener } from '../hooks';
import SocketService from '../services/socket';
import ApiService from '../services/api';
import { Bus, Driver } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiPost(path: string, body: object, token?: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BusForm {
  busId: string;
  busName: string;
  driverName: string;
  routeName: string;
  origin: string;
  destination: string;
  waypoints: string; // comma-separated string in UI
}

const EMPTY_BUS_FORM: BusForm = {
  busId: '', busName: '', driverName: '',
  routeName: '', origin: '', destination: '', waypoints: '',
};

// ─── Component ────────────────────────────────────────────────────────────────

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('authToken') || '';

  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [activeBuses, setActiveBuses] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state
  const [showBusModal, setShowBusModal] = useState(false);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [busForm, setBusForm] = useState<BusForm>(EMPTY_BUS_FORM);

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinBusId, setPinBusId] = useState('');
  const [newPin, setNewPin] = useState('');

  // Simulation state
  const [simBusId, setSimBusId] = useState('');
  const [simRunning, setSimRunning] = useState<string | null>(null); // busId currently simulating

  // ─── Load data ────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        const [busRes, driverRes] = await Promise.all([
          ApiService.getBuses(),
          ApiService.getDrivers(),
        ]);
        const busList = Array.isArray(busRes.data) ? busRes.data : [];
        const driverList = Array.isArray(driverRes.data) ? driverRes.data : [];
        setBuses(busList);
        setDrivers(driverList);
        setActiveBuses(busList.filter((b: any) => b.isActive).length);
      } catch {
        setError('Failed to load dashboard data. Is the server running?');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // ─── Socket ───────────────────────────────────────────────────────────────

  useEffect(() => {
    SocketService.connect(token)
      .then(() => SocketService.joinAdminRoom())
      .catch(() => {});
    return () => { SocketService.leaveAdminRoom(); SocketService.disconnect(); };
  }, [token]);

  useSocketListener('location-update', (data: any) => {
    setBuses((prev) =>
      prev.map((b: any) =>
        (b.busId || b.id) === data.busId
          ? { ...b, isActive: true, lastLocation: { latitude: data.latitude, longitude: data.longitude, timestamp: data.timestamp } }
          : b
      )
    );
  });

  useSocketListener('bus-status-change', (data: any) => {
    if (data.status === 'online') setActiveBuses((n) => n + 1);
    if (data.status === 'offline') setActiveBuses((n) => Math.max(0, n - 1));
  });

  // ─── Bus CRUD ─────────────────────────────────────────────────────────────

  const openAddModal = () => {
    setEditingBus(null);
    setBusForm(EMPTY_BUS_FORM);
    setShowBusModal(true);
  };

  const openEditModal = (bus: any) => {
    setEditingBus(bus);
    setBusForm({
      busId: bus.busId || bus.id || '',
      busName: bus.busName || bus.busNumber || '',
      driverName: bus.driverName || '',
      routeName: bus.routeName || '',
      origin: bus.origin || '',
      destination: bus.destination || '',
      waypoints: Array.isArray(bus.waypoints) ? bus.waypoints.join(', ') : (bus.waypoints || ''),
    });
    setShowBusModal(true);
  };

  const handleSaveBus = async () => {
    if (!busForm.busId.trim()) { setError('Bus ID is required.'); return; }

    const payload = {
      busId: busForm.busId.trim(),
      busName: busForm.busName.trim() || busForm.busId.trim(),
      driverName: busForm.driverName.trim(),
      routeName: busForm.routeName.trim(),
      origin: busForm.origin.trim(),
      destination: busForm.destination.trim(),
      waypoints: busForm.waypoints
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean),
    };

    try {
      if (editingBus) {
        const res = await ApiService.updateBus(payload.busId, payload);
        if (res.data) {
          setBuses((prev) => prev.map((b: any) => (b.busId || b.id) === payload.busId ? { ...b, ...res.data } : b));
          setSuccess('Bus updated.');
        }
      } else {
        const res = await ApiService.createBus(payload);
        if (res.data) {
          setBuses((prev) => [...prev, res.data as Bus]);
          setSuccess('Bus created. Default PIN is 1234.');
        }
      }
      setShowBusModal(false);
    } catch (e: any) {
      setError(e.message || 'Failed to save bus.');
    }
  };

  const handleDeleteBus = async (busId: string) => {
    if (!window.confirm(`Delete bus ${busId}? This also removes its location history.`)) return;
    try {
      await ApiService.deleteBus(busId);
      setBuses((prev) => prev.filter((b: any) => (b.busId || b.id) !== busId));
      setSuccess('Bus deleted.');
    } catch (e: any) {
      setError(e.message || 'Failed to delete bus.');
    }
  };

  const handleSetPin = async () => {
    if (!newPin || newPin.length < 4) { setError('PIN must be at least 4 digits.'); return; }
    try {
      const res = await fetch(`${API_BASE}/bus/${pinBusId}/set-pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPin }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`PIN updated for ${pinBusId}.`);
        setShowPinModal(false);
        setNewPin('');
      } else {
        setError(data.message || 'Failed to set PIN.');
      }
    } catch {
      setError('Server error while setting PIN.');
    }
  };

  // ─── Simulation ───────────────────────────────────────────────────────────

  const handleStartSim = async (busId: string) => {
    try {
      const data = await apiPost('/simulate/start', { busId, intervalMs: 4000 }, token);
      if (data.success) {
        setSimRunning(busId);
        setSimBusId(busId);
        setSuccess(`Simulation started for ${busId} — students can now see it on the map.`);
      } else {
        setError(data.message || 'Failed to start simulation.');
      }
    } catch {
      setError('Server error starting simulation.');
    }
  };

  const handleStopSim = async (busId: string) => {
    try {
      const data = await apiPost('/simulate/stop', { busId }, token);
      if (data.success) {
        setSimRunning(null);
        setSimBusId('');
        setSuccess(`Simulation stopped for ${busId}.`);
      } else {
        setError(data.message || 'Failed to stop simulation.');
      }
    } catch {
      setError('Server error stopping simulation.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('adminEmail');
    navigate('/admin/login');
  };

  if (isLoading) {
    return (
      <div className="full-center">
        <div className="spinner" />
        <span style={{ marginTop: 12, color: 'var(--text-muted)' }}>Loading dashboard…</span>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <AdminSidebar />

      <div className="admin-main">
        <Navbar
          title="Admin Dashboard"
          subtitle="Fleet & routing management"
          rightAction={
            <>
              <span className="chip">Active: {activeBuses}</span>
              <Button size="sm" variant="secondary" onClick={handleLogout} className="btn-outline">
                Log out
              </Button>
            </>
          }
        />

        <div className="admin-content">
          {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
          {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

          {/* ── Metrics ── */}
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-label">Total Buses</div>
              <div className="metric-value">{buses.length}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Active Now</div>
              <div className="metric-value" style={{ color: 'var(--success)' }}>{activeBuses}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Drivers</div>
              <div className="metric-value">{drivers.length}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Routes configured</div>
              <div className="metric-value">
                {buses.filter((b: any) => b.origin && b.destination).length}
              </div>
            </div>
          </div>

          {/* ── Bus Management ── */}
          <section className="panel">
            <div className="section-header">
              <h2 className="section-title">Buses & Routes</h2>
              <Button onClick={openAddModal}>+ Add Bus</Button>
            </div>

            {/* Add / Edit form */}
            {showBusModal && (
              <div className="panel" style={{ marginBottom: '1.5rem', background: 'var(--surface-2)' }}>
                <div className="panel-title">{editingBus ? 'Edit Bus' : 'Add New Bus'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Bus ID *</label>
                    <input className="form-control" placeholder="BUS001" value={busForm.busId}
                      onChange={(e) => setBusForm({ ...busForm, busId: e.target.value })}
                      disabled={!!editingBus} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Bus Name</label>
                    <input className="form-control" placeholder="Route 1 Express" value={busForm.busName}
                      onChange={(e) => setBusForm({ ...busForm, busName: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Driver Name</label>
                    <input className="form-control" placeholder="Driver name" value={busForm.driverName}
                      onChange={(e) => setBusForm({ ...busForm, driverName: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Route Label</label>
                    <input className="form-control" placeholder="Navalur → Agni College" value={busForm.routeName}
                      onChange={(e) => setBusForm({ ...busForm, routeName: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Origin (for Google Maps)</label>
                    <input className="form-control" placeholder="Navalur, Chennai" value={busForm.origin}
                      onChange={(e) => setBusForm({ ...busForm, origin: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Destination (for Google Maps)</label>
                    <input className="form-control" placeholder="Agni College of Technology" value={busForm.destination}
                      onChange={(e) => setBusForm({ ...busForm, destination: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                    <label className="form-label">Waypoints (comma-separated)</label>
                    <input className="form-control" placeholder="Sholinganallur, Semmenchery" value={busForm.waypoints}
                      onChange={(e) => setBusForm({ ...busForm, waypoints: e.target.value })} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                      These are the stops shown on the student map route line
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                  <Button onClick={handleSaveBus}>{editingBus ? 'Update Bus' : 'Save Bus'}</Button>
                  <Button variant="secondary" onClick={() => setShowBusModal(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* PIN modal */}
            {showPinModal && (
              <div className="panel" style={{ marginBottom: '1.5rem', background: 'var(--surface-2)', maxWidth: 360 }}>
                <div className="panel-title">Set PIN for {pinBusId}</div>
                <div className="form-group">
                  <label className="form-label">New PIN (min 4 digits)</label>
                  <input className="form-control" type="password" placeholder="••••" value={newPin}
                    onChange={(e) => setNewPin(e.target.value)} maxLength={8} />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <Button onClick={handleSetPin}>Save PIN</Button>
                  <Button variant="secondary" onClick={() => { setShowPinModal(false); setNewPin(''); }}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Bus table */}
            {buses.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No buses yet. Click <strong>+ Add Bus</strong> to create one.
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Bus ID</th>
                      <th>Name</th>
                      <th>Driver</th>
                      <th>Route</th>
                      <th>Origin → Destination</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buses.map((bus: any) => (
                      <tr key={bus.busId || bus.id}>
                        <td><strong>{bus.busId || bus.id}</strong></td>
                        <td>{bus.busName || bus.busNumber || '—'}</td>
                        <td>{bus.driverName || '—'}</td>
                        <td>{bus.routeName || '—'}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {bus.origin && bus.destination
                            ? `${bus.origin} → ${bus.destination}`
                            : <span style={{ color: 'var(--warning)' }}>Not configured</span>}
                        </td>
                        <td>
                          <Badge variant={bus.isActive ? 'success' : 'default' as any}>
                            {bus.isActive ? 'Active' : 'Idle'}
                          </Badge>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <Button size="sm" variant="secondary" onClick={() => openEditModal(bus)}>Edit</Button>
                            <Button size="sm" variant="secondary" onClick={() => { setPinBusId(bus.busId || bus.id); setShowPinModal(true); }}>PIN</Button>
                            <Button size="sm" variant="danger" onClick={() => handleDeleteBus(bus.busId || bus.id)}>Delete</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Drivers section ── */}
          <section className="panel" style={{ marginTop: '1.5rem' }}>
            <div className="section-header">
              <h2 className="section-title">Drivers</h2>
            </div>
            {drivers.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Drivers are managed via bus assignments above.
                Each bus has its own driver name and PIN.
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr><th>Name</th><th>Phone</th><th>License</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {drivers.map((d) => (
                      <tr key={d.id}>
                        <td>{d.name}</td>
                        <td>{d.phoneNumber}</td>
                        <td>{d.licenseNumber}</td>
                        <td><Badge variant={d.status === 'active' ? 'success' : 'danger'}>{d.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Simulation ── */}
          <section className="panel" style={{ marginTop: '1.5rem' }}>
            <div className="section-header">
              <h2 className="section-title">Demo Simulation</h2>
              <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>Testing tool</span>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Start a server-side GPS simulation for any bus. Students will see it move on the map in real time — no physical device needed.
            </p>
            {buses.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Add a bus first to use simulation.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                <select
                  className="form-control"
                  style={{ width: 'auto', minWidth: 200 }}
                  value={simBusId}
                  onChange={(e) => setSimBusId(e.target.value)}
                  disabled={simRunning !== null}
                >
                  <option value="">— Select a bus —</option>
                  {buses.map((bus: any) => (
                    <option key={bus.busId || bus.id} value={bus.busId || bus.id}>
                      {bus.busName || bus.busId || bus.id}
                    </option>
                  ))}
                </select>
                {simRunning ? (
                  <Button variant="danger" onClick={() => handleStopSim(simRunning)}>
                    ■ Stop Simulation ({simRunning})
                  </Button>
                ) : (
                  <Button
                    disabled={!simBusId}
                    onClick={() => simBusId && handleStartSim(simBusId)}
                  >
                    ▶ Start Simulation
                  </Button>
                )}
                {simRunning && (
                  <span className="chip" style={{ background: 'rgba(27,122,90,0.1)', color: 'var(--success)' }}>
                    ● Live — bus moving on map
                  </span>
                )}
              </div>
            )}
          </section>

          {/* ── Quick help ── */}
          <section className="panel" style={{ marginTop: '1.5rem', background: 'var(--surface-2)' }}>
            <div className="panel-title">Setup guide</div>
            <ol style={{ paddingLeft: '1.2rem', display: 'grid', gap: '0.5rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              <li>Add a bus with a unique <strong>Bus ID</strong> (e.g. BUS001)</li>
              <li>Set <strong>Origin</strong>, <strong>Destination</strong> and optional <strong>Waypoints</strong> — these power the route on the student map</li>
              <li>Give the driver their Bus ID and PIN (default: <strong>1234</strong>) — change it with the PIN button</li>
              <li>Driver logs in at <strong>/driver/login</strong> and presses Start Tracking</li>
              <li>Students open <strong>/student</strong> and select the bus to see the live route</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
