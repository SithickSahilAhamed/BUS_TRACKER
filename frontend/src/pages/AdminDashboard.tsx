/**
 * ADMIN DASHBOARD
 * Fleet management on Firestore: buses (with geocoded OSM route), driver
 * accounts, and a live tracking map. Tab shown depends on the /admin/* path.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Alert, Badge, Select } from '../components/common';
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
  subscribeToStudents,
  assignStudentStop,
  subscribeToReports,
  resolveReport,
  subscribeToMissedBusRequests,
  resolveMissedBusRequest,
  subscribeToEntryExitLogs,
  suggestAlternativeBuses,
  reallocateBusRiders,
  normalizeBusId,
} from '../services/firestore';
import { buildRoute } from '../services/geo';
import { progressAlongPath } from '../utils/eta';
import type { Bus, DriverReport, EntryExitLog, MissedBusRequest, UserProfile } from '../types';

// ─── Forms ────────────────────────────────────────────────────────────────────

interface BusForm {
  busNumber: string;
  busName: string;
  routeName: string;
  origin: string;
  destination: string;
  waypoints: string; // comma-separated in the UI
  capacity: string; // number input, kept as a string until save
}

const EMPTY_BUS_FORM: BusForm = {
  busNumber: '', busName: '', routeName: '', origin: '', destination: '', waypoints: '', capacity: '',
};

interface DriverForm {
  name: string;
  phone: string;
  email: string;
  password: string;
}

const EMPTY_DRIVER_FORM: DriverForm = { name: '', phone: '', email: '', password: '' };

type AttendanceStatus = 'boarded' | 'waiting' | 'likely absent';

/** Boarded beats everything; otherwise compares the rider's stop to the
 *  bus's current position along its route (same projection as the driver's
 *  Next Stop panel) to guess whether the bus already went past them. */
const riderAttendanceStatus = (bus: Bus, stopName: string | null | undefined): AttendanceStatus => {
  const stop = bus.stops?.find((s) => s.name === stopName);
  if (!stop || !bus.routePath || bus.routePath.length < 2 || !bus.lastLocation) return 'waiting';
  const busProgress = progressAlongPath(bus.routePath, bus.lastLocation);
  const stopProgress = progressAlongPath(bus.routePath, stop);
  return stopProgress < busProgress - 0.05 ? 'likely absent' : 'waiting';
};

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
    : location.pathname === '/admin/students' ? 'students'
    : location.pathname === '/admin/reports' ? 'reports'
    : location.pathname === '/admin/attendance' ? 'attendance'
    : location.pathname === '/admin/tracking' ? 'tracking'
    : 'overview';

  const { buses, loading: busesLoading } = useBuses();
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<DriverReport[]>([]);
  const [missedBusRequests, setMissedBusRequests] = useState<MissedBusRequest[]>([]);
  const [entryExitLogs, setEntryExitLogs] = useState<EntryExitLog[]>([]);
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

  // Assign-stop modal
  const [assigningStudent, setAssigningStudent] = useState<UserProfile | null>(null);
  const [assignForm, setAssignForm] = useState<{ busId: string; stopName: string }>({ busId: '', stopName: '' });
  const [assignSaving, setAssignSaving] = useState(false);

  // Breakdown reallocation modal
  const [reallocatingBus, setReallocatingBus] = useState<Bus | null>(null);
  const [reallocateTargetId, setReallocateTargetId] = useState('');
  const [reallocateSaving, setReallocateSaving] = useState(false);

  // Tracking tab selection
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToDrivers(setDrivers, () =>
      setError('Could not load drivers. Are you signed in as admin?')
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToStudents(setStudents, () =>
      setError('Could not load students. Are you signed in as admin?')
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToReports(setReports, () =>
      setError('Could not load reports. Are you signed in as admin?')
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToMissedBusRequests(setMissedBusRequests, () =>
      setError('Could not load missed-bus requests. Are you signed in as admin?')
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToEntryExitLogs(setEntryExitLogs, () =>
      setError('Could not load the entry/exit log. Are you signed in as admin?')
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
  const openReportCount = useMemo(() => reports.filter((r) => r.status === 'open').length, [reports]);

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
      capacity: bus.capacity ? String(bus.capacity) : '',
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
      capacity: Math.max(0, parseInt(busForm.capacity, 10) || 0),
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

  // ─── Student assignment handlers ────────────────────────────────────────────

  const openAssignModal = (student: UserProfile) => {
    setAssigningStudent(student);
    setAssignForm({ busId: student.assignedBusId ?? '', stopName: student.assignedStopName ?? '' });
  };

  const assignFormBus = useMemo(
    () => buses.find((b) => b.busId === assignForm.busId) ?? null,
    [buses, assignForm.busId]
  );

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningStudent) return;
    setAssignSaving(true);
    try {
      await assignStudentStop(assigningStudent.uid, {
        assignedBusId: assignForm.busId || null,
        assignedStopName: assignForm.stopName || null,
      });
      setSuccess(`${assigningStudent.name}'s bus assignment was updated.`);
      setAssigningStudent(null);
    } catch {
      setError('Saving the assignment failed.');
    } finally {
      setAssignSaving(false);
    }
  };

  const handleClearAssignment = async (student: UserProfile) => {
    if (!window.confirm(`Clear ${student.name}'s bus assignment?`)) return;
    try {
      await assignStudentStop(student.uid, { assignedBusId: null, assignedStopName: null });
      setSuccess(`${student.name}'s bus assignment was cleared.`);
    } catch {
      setError('Clearing the assignment failed.');
    }
  };

  // ─── Report handlers ────────────────────────────────────────────────────────

  const handleResolveReport = async (report: DriverReport) => {
    try {
      await resolveReport(report.id);
      setSuccess(`Report on ${report.busId} marked resolved.`);
    } catch {
      setError('Resolving the report failed.');
    }
  };

  // ─── Missed bus handlers ────────────────────────────────────────────────────

  const handleMissedBusDecision = async (req: MissedBusRequest, decision: 'approved' | 'denied') => {
    try {
      await resolveMissedBusRequest(req.id, decision);
      setSuccess(`${req.studentName}'s request was ${decision}.`);
    } catch {
      setError('Updating the request failed.');
    }
  };

  // ─── Breakdown reallocation handlers ────────────────────────────────────────

  const openReallocateModal = (bus: Bus) => {
    setReallocatingBus(bus);
    setReallocateTargetId('');
  };

  const reallocateSuggestions = useMemo(
    () => (reallocatingBus ? suggestAlternativeBuses(reallocatingBus.busId, buses, students) : []),
    [reallocatingBus, buses, students]
  );
  const reallocateAffectedCount = useMemo(
    () => (reallocatingBus ? students.filter((s) => s.assignedBusId === reallocatingBus.busId).length : 0),
    [reallocatingBus, students]
  );

  const handleReallocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reallocatingBus || !reallocateTargetId) return;
    setReallocateSaving(true);
    try {
      const count = await reallocateBusRiders(reallocatingBus.busId, reallocateTargetId);
      setSuccess(
        `Moved ${count} rider${count === 1 ? '' : 's'} from ${reallocatingBus.busId} to ${reallocateTargetId}. ` +
          `Their stops were cleared — reassign them in the Students tab.`
      );
      setReallocatingBus(null);
    } catch {
      setError('Reallocating riders failed.');
    } finally {
      setReallocateSaving(false);
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
        <div className="metric-card">
          <div className="metric-label">Open reports</div>
          <div className="metric-value">{openReportCount}</div>
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
              <tr><th>Bus</th><th>Name</th><th>Route</th><th>Seats</th><th>Status</th><th>Actions</th></tr>
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
                  <td>{bus.capacity || '—'}</td>
                  <td>
                    {bus.isActive
                      ? <Badge variant="success">on trip · {bus.activeDriverName}</Badge>
                      : <Badge variant="info">idle</Badge>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Button variant="secondary" size="sm" onClick={() => openEditBus(bus)}>Edit</Button>{' '}
                    <Button variant="secondary" size="sm" onClick={() => openReallocateModal(bus)}>Reallocate riders</Button>{' '}
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

  const renderStudents = () => (
    <div className="panel">
      <div className="section-header">
        <div className="panel-title" style={{ marginBottom: 0 }}>Students</div>
      </div>
      {students.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          No students or professors have signed up yet.
        </p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Assigned bus</th><th>Stop</th><th></th></tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const bus = buses.find((b) => b.busId === student.assignedBusId);
                return (
                  <tr key={student.uid}>
                    <td><strong>{student.name}</strong></td>
                    <td>{student.email}</td>
                    <td style={{ textTransform: 'capitalize' }}>{student.role}</td>
                    <td>{bus ? `${bus.busId} · ${bus.routeName || bus.busName}` : <span style={{ color: 'var(--text-muted)' }}>Not assigned</span>}</td>
                    <td>{student.assignedStopName || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Button variant="secondary" size="sm" onClick={() => openAssignModal(student)}>
                        {student.assignedBusId ? 'Change' : 'Assign'}
                      </Button>{' '}
                      {student.assignedBusId && (
                        <Button variant="danger" size="sm" onClick={() => handleClearAssignment(student)}>
                          Clear
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderReports = () => (
    <div className="panel">
      <div className="section-header">
        <div className="panel-title" style={{ marginBottom: 0 }}>Driver Reports</div>
      </div>
      {reports.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No incident or damage reports yet.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Type</th><th>Bus</th><th>Driver</th><th>Details</th><th>When</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.type === 'incident' ? '🚧' : '🔧'} {r.category}
                  </td>
                  <td><strong>{r.busNumber}</strong></td>
                  <td>{r.driverName}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{r.description || '—'}</td>
                  <td>{r.createdAt ? r.createdAt.toDate().toLocaleString() : 'just now'}</td>
                  <td>
                    {r.status === 'open'
                      ? <Badge variant="warning">open</Badge>
                      : <Badge variant="success">resolved</Badge>}
                  </td>
                  <td>
                    {r.status === 'open' && (
                      <Button variant="secondary" size="sm" onClick={() => handleResolveReport(r)}>
                        Mark resolved
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderAttendance = () => {
    const activeBuses = buses.filter((b) => b.isActive);
    const assignedRiders = activeBuses.flatMap((bus) =>
      students
        .filter((s) => s.assignedBusId === bus.busId)
        .map((s) => ({
          bus,
          student: s,
          status: bus.boardedStudentIds?.includes(s.uid)
            ? ('boarded' as const)
            : riderAttendanceStatus(bus, s.assignedStopName),
        }))
    );
    const pendingMissedBus = missedBusRequests.filter((r) => r.status === 'pending');

    return (
      <>
        <div className="panel">
          <div className="panel-title">Live Attendance</div>
          {activeBuses.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No bus is on a trip right now.</p>
          ) : assignedRiders.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No riders are assigned to any bus currently on a trip.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Bus</th><th>Student</th><th>Stop</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {assignedRiders.map(({ bus, student, status }) => (
                    <tr key={`${bus.busId}-${student.uid}`}>
                      <td><strong>{bus.busId}</strong></td>
                      <td>{student.name}</td>
                      <td>{student.assignedStopName || '—'}</td>
                      <td>
                        {status === 'boarded' && <Badge variant="success">boarded</Badge>}
                        {status === 'waiting' && <Badge variant="info">waiting</Badge>}
                        {status === 'likely absent' && <Badge variant="warning">likely absent</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">Missed Bus Requests</div>
          {pendingMissedBus.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No pending requests.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Student</th><th>Missed</th><th>Requested</th><th>When</th><th></th></tr>
                </thead>
                <tbody>
                  {pendingMissedBus.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.studentName}</strong></td>
                      <td>{r.originalBusId}</td>
                      <td>{r.requestedBusNumber}</td>
                      <td>{r.createdAt ? r.createdAt.toDate().toLocaleString() : 'just now'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <Button size="sm" onClick={() => handleMissedBusDecision(r, 'approved')}>Approve</Button>{' '}
                        <Button variant="danger" size="sm" onClick={() => handleMissedBusDecision(r, 'denied')}>Deny</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">Campus Entry / Exit Log</div>
          {entryExitLogs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No geofence crossings recorded yet.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Bus</th><th>Event</th><th>When</th></tr>
                </thead>
                <tbody>
                  {entryExitLogs.slice(0, 50).map((log) => (
                    <tr key={log.id}>
                      <td><strong>{log.busNumber}</strong></td>
                      <td>
                        {log.event === 'entry'
                          ? <Badge variant="success">entered campus</Badge>
                          : <Badge variant="info">left campus</Badge>}
                      </td>
                      <td>{log.at ? log.at.toDate().toLocaleString() : 'just now'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  };

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
              {tab === 'students' && 'Students'}
              {tab === 'reports' && 'Driver Reports'}
              {tab === 'attendance' && 'Attendance'}
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
          {tab === 'students' && renderStudents()}
          {tab === 'reports' && renderReports()}
          {tab === 'attendance' && renderAttendance()}
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
                <label className="form-label">Seating capacity</label>
                <input
                  type="number"
                  min={0}
                  className="form-control"
                  placeholder="e.g. 52"
                  value={busForm.capacity}
                  onChange={(e) => setBusForm({ ...busForm, capacity: e.target.value })}
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

      {/* ── Assign bus & stop modal ── */}
      {assigningStudent && (
        <div className="modal-backdrop" onClick={() => !assignSaving && setAssigningStudent(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">Assign {assigningStudent.name}'s bus</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '.88rem', marginBottom: '1rem' }}>
              This is the bus and stop {assigningStudent.name} sees as "My Bus" with a live ETA.
            </p>
            <form onSubmit={handleSaveAssignment}>
              <Select
                label="Bus"
                value={assignForm.busId}
                onChange={(e) => setAssignForm({ busId: e.target.value, stopName: '' })}
                options={buses.map((b) => ({ value: b.busId, label: `${b.busId} · ${b.routeName || b.busName}` }))}
                required
              />
              {assignForm.busId && (
                assignFormBus?.stops?.length ? (
                  <Select
                    label="Boarding stop"
                    value={assignForm.stopName}
                    onChange={(e) => setAssignForm({ ...assignForm, stopName: e.target.value })}
                    options={assignFormBus.stops.map((s) => ({ value: s.name, label: s.name }))}
                    required
                  />
                ) : (
                  <p style={{ color: 'var(--warning)', fontSize: '.85rem', marginBottom: '1rem' }}>
                    This bus has no saved stops yet — edit it in the Buses tab with an origin/destination first.
                  </p>
                )
              )}
              <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="secondary" onClick={() => setAssigningStudent(null)} disabled={assignSaving}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={assignSaving} disabled={!assignForm.busId || !assignForm.stopName}>
                  Save assignment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Breakdown reallocation modal ── */}
      {reallocatingBus && (
        <div className="modal-backdrop" onClick={() => !reallocateSaving && setReallocatingBus(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">Reallocate {reallocatingBus.busId}'s riders</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '.88rem', marginBottom: '1rem' }}>
              {reallocateAffectedCount} rider{reallocateAffectedCount === 1 ? ' is' : 's are'} permanently assigned
              to {reallocatingBus.busId}. Moving them clears their stop — reassign it per student afterward.
            </p>
            {reallocateSuggestions.length === 0 ? (
              <p style={{ color: 'var(--warning)', fontSize: '.85rem' }}>
                No other bus has free seats (or capacities aren't set) — nothing to suggest.
              </p>
            ) : (
              <form onSubmit={handleReallocate}>
                <Select
                  label="Move riders to"
                  value={reallocateTargetId}
                  onChange={(e) => setReallocateTargetId(e.target.value)}
                  options={reallocateSuggestions.map(({ bus, availableSeats }) => ({
                    value: bus.busId,
                    label: `${bus.busId} · ${bus.routeName || bus.busName} — ${availableSeats} seats free`,
                  }))}
                  required
                />
                <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
                  <Button type="button" variant="secondary" onClick={() => setReallocatingBus(null)} disabled={reallocateSaving}>
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={reallocateSaving} disabled={!reallocateTargetId}>
                    Allocate
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboardPage;
