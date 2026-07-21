/**
 * MAINTENANCE PANEL
 * Maintenance Team role (PROJECT_SPEC.md section 1.5): view/close repair
 * requests (reuses drivers' damage reports from Phase 2 — see
 * services/firestore.ts's subscribeToDamageReports), log completed
 * maintenance work, and schedule the next service date per bus.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { Navbar, Alert, Button, Select, Input } from '../components/common';
import { NotificationBell } from '../components/NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useBuses } from '../hooks/useBuses';
import {
  subscribeToDamageReports,
  resolveReport,
  addMaintenanceRecord,
  setNextServiceDueDate,
} from '../services/firestore';
import { serviceDueInfo } from '../utils/maintenance';
import { MAINTENANCE_CATEGORIES } from '../types';
import type { DriverReport } from '../types';

const MaintenancePanelPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { buses } = useBuses();

  const [reports, setReports] = useState<DriverReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [closingReport, setClosingReport] = useState<DriverReport | null>(null);
  const [repairNotes, setRepairNotes] = useState('');
  const [closeSaving, setCloseSaving] = useState(false);

  const [logForm, setLogForm] = useState({ busId: '', category: '', description: '', cost: '' });
  const [logSaving, setLogSaving] = useState(false);

  const [serviceDateBusId, setServiceDateBusId] = useState('');
  const [serviceDateValue, setServiceDateValue] = useState('');
  const [serviceDateSaving, setServiceDateSaving] = useState(false);

  useEffect(() => {
    const unsub = subscribeToDamageReports(setReports, () =>
      setError('Could not load repair requests. Are you signed in as maintenance staff?')
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => { setSuccess(null); setError(null); }, 5000);
    return () => clearTimeout(t);
  }, [success, error]);

  const openRequests = useMemo(() => reports.filter((r) => r.status === 'open'), [reports]);
  const busesDueSoon = useMemo(
    () => buses
      .map((b) => ({ bus: b, due: serviceDueInfo(b.nextServiceDueDate) }))
      .filter((b): b is { bus: typeof buses[number]; due: NonNullable<typeof b.due> } => !!b.due && b.due.status !== 'ok'),
    [buses]
  );

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const openCloseModal = (report: DriverReport) => {
    setClosingReport(report);
    setRepairNotes('');
  };

  const handleCloseRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingReport) return;
    setCloseSaving(true);
    try {
      await resolveReport(closingReport.id, repairNotes);
      setSuccess(`Repair request on ${closingReport.busNumber} closed.`);
      setClosingReport(null);
    } catch {
      setError('Closing the repair request failed.');
    } finally {
      setCloseSaving(false);
    }
  };

  const handleLogWork = async (e: React.FormEvent) => {
    e.preventDefault();
    const bus = buses.find((b) => b.busId === logForm.busId);
    if (!bus) return;
    setLogSaving(true);
    try {
      await addMaintenanceRecord({
        busId: bus.busId,
        busNumber: bus.busNumber,
        category: logForm.category,
        description: logForm.description.trim(),
        cost: logForm.cost ? Number(logForm.cost) : null,
        performedAt: new Date(),
      });
      setSuccess(`Logged ${logForm.category.toLowerCase()} work on ${bus.busId}.`);
      setLogForm({ busId: '', category: '', description: '', cost: '' });
    } catch {
      setError('Logging the maintenance work failed.');
    } finally {
      setLogSaving(false);
    }
  };

  const handleScheduleService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceDateBusId || !serviceDateValue) return;
    setServiceDateSaving(true);
    try {
      await setNextServiceDueDate(serviceDateBusId, Timestamp.fromDate(new Date(serviceDateValue)));
      setSuccess(`Next service for ${serviceDateBusId} set to ${serviceDateValue}.`);
      setServiceDateBusId('');
      setServiceDateValue('');
    } catch {
      setError('Scheduling the service date failed.');
    } finally {
      setServiceDateSaving(false);
    }
  };

  return (
    <div className="campus-shell">
      <Navbar
        title="Maintenance Panel"
        subtitle={profile ? profile.name : 'Agni College of Technology'}
        rightAction={
          <>
            <span className="chip">
              {openRequests.length} open repair{openRequests.length === 1 ? '' : 's'}
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

        {busesDueSoon.length > 0 && (
          <div className="alert alert-warning" style={{ marginBottom: '1rem', flexDirection: 'column', alignItems: 'flex-start', gap: '.35rem' }}>
            <strong>Service due</strong>
            {busesDueSoon.map(({ bus, due }) => (
              <span key={bus.busId}>
                {bus.busId} — {due.status === 'expired' ? `overdue by ${Math.abs(due.daysLeft)} day(s)` : `due in ${due.daysLeft} day(s)`}
              </span>
            ))}
          </div>
        )}

        <div className="two-col">
          {/* ── Repair requests ── */}
          <div className="panel">
            <div className="panel-title">Repair Requests</div>
            {openRequests.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No open repair requests.</p>
            ) : (
              <div style={{ display: 'grid', gap: '.5rem' }}>
                {openRequests.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '.65rem .75rem', borderRadius: 'var(--radius)',
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{r.busNumber} · {r.category}</strong>
                      <Button size="sm" onClick={() => openCloseModal(r)}>Close</Button>
                    </div>
                    {r.description && (
                      <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', margin: '.35rem 0 0' }}>{r.description}</p>
                    )}
                    <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: '.35rem 0 0' }}>
                      Reported by {r.driverName} · {r.createdAt ? r.createdAt.toDate().toLocaleString() : 'just now'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Log maintenance work ── */}
          <div className="panel">
            <div className="panel-title">Log Maintenance Work</div>
            <form onSubmit={handleLogWork}>
              <Select
                label="Bus"
                value={logForm.busId}
                onChange={(e) => setLogForm({ ...logForm, busId: e.target.value })}
                options={buses.map((b) => ({ value: b.busId, label: `${b.busId} · ${b.busName}` }))}
                required
              />
              <Select
                label="Category"
                value={logForm.category}
                onChange={(e) => setLogForm({ ...logForm, category: e.target.value })}
                options={MAINTENANCE_CATEGORIES.map((c) => ({ value: c, label: c }))}
                required
              />
              <div className="form-group">
                <label className="form-label">What was done</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="e.g. Replaced front-left tyre"
                  value={logForm.description}
                  onChange={(e) => setLogForm({ ...logForm, description: e.target.value })}
                  required
                />
              </div>
              <Input
                label="Cost (optional)"
                type="number"
                min={0}
                placeholder="e.g. 1200"
                value={logForm.cost}
                onChange={(e) => setLogForm({ ...logForm, cost: e.target.value })}
              />
              <Button type="submit" isLoading={logSaving} disabled={!logForm.busId || !logForm.category || !logForm.description}>
                Add to history
              </Button>
            </form>

            <div className="panel-title" style={{ marginTop: '1.5rem' }}>Schedule Service</div>
            <form onSubmit={handleScheduleService}>
              <Select
                label="Bus"
                value={serviceDateBusId}
                onChange={(e) => setServiceDateBusId(e.target.value)}
                options={buses.map((b) => ({ value: b.busId, label: b.busId }))}
                required
              />
              <Input
                label="Next service due"
                type="date"
                value={serviceDateValue}
                onChange={(e) => setServiceDateValue(e.target.value)}
                required
              />
              <Button type="submit" isLoading={serviceDateSaving} disabled={!serviceDateBusId || !serviceDateValue}>
                Save due date
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Close repair request modal ── */}
      {closingReport && (
        <div className="modal-backdrop" onClick={() => !closeSaving && setClosingReport(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">Close {closingReport.busNumber}'s repair request</h2>
            <form onSubmit={handleCloseRequest}>
              <div className="form-group">
                <label className="form-label">Repair notes (optional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="What was fixed…"
                  value={repairNotes}
                  onChange={(e) => setRepairNotes(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="secondary" onClick={() => setClosingReport(null)} disabled={closeSaving}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={closeSaving}>
                  Mark closed
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenancePanelPage;
