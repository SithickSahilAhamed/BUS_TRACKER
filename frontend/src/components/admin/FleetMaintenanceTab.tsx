/**
 * Fleet Maintenance tab (PROJECT_SPEC.md section 5): vehicle profile +
 * document expiry, fuel log, maintenance history, and repair requests
 * (drivers' damage reports from Phase 2) for a selected bus, plus a
 * fleet-wide "needs attention" summary up top.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Button, Alert, Badge, Select, Input } from '../common';
import {
  subscribeToFuelRecords,
  addFuelRecord,
  subscribeToMaintenanceRecords,
  addMaintenanceRecord,
  subscribeToDamageReports,
  resolveReport,
  updateVehicleProfile,
  setNextServiceDueDate,
} from '../../services/firestore';
import { expiryInfo, serviceDueInfo, type ExpiryStatus } from '../../utils/maintenance';
import { MAINTENANCE_CATEGORIES } from '../../types';
import type { Bus, DriverReport, FuelRecord, MaintenanceRecord, VehicleProfile } from '../../types';

const tsToInput = (ts: Timestamp | null | undefined): string => (ts ? ts.toDate().toISOString().slice(0, 10) : '');
const inputToTs = (s: string): Timestamp | null => (s ? Timestamp.fromDate(new Date(s)) : null);

const EMPTY_PROFILE: VehicleProfile = {
  model: '', manufacturer: '', registrationNumber: '', engineNumber: '', chassisNumber: '',
  insuranceExpiry: null, permitExpiry: null, fcExpiry: null, pucExpiry: null,
};

const expiryBadge = (status: ExpiryStatus) =>
  status === 'expired' ? <Badge variant="danger">expired</Badge>
    : status === 'due-soon' ? <Badge variant="warning">due soon</Badge>
    : <Badge variant="success">ok</Badge>;

const DOCUMENT_FIELDS: Array<{ key: keyof VehicleProfile; label: string }> = [
  { key: 'insuranceExpiry', label: 'Insurance' },
  { key: 'permitExpiry', label: 'Permit' },
  { key: 'fcExpiry', label: 'FC (Fitness Certificate)' },
  { key: 'pucExpiry', label: 'PUC (Pollution Certificate)' },
];

interface Props {
  buses: Bus[];
}

export const FleetMaintenanceTab: React.FC<Props> = ({ buses }) => {
  const [selectedBusId, setSelectedBusId] = useState('');
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [damageReports, setDamageReports] = useState<DriverReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState<VehicleProfile>(EMPTY_PROFILE);
  const [serviceDate, setServiceDate] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const [fuelForm, setFuelForm] = useState({ date: '', litres: '', cost: '', station: '', odometerKm: '' });
  const [fuelSaving, setFuelSaving] = useState(false);

  const [logForm, setLogForm] = useState({ category: '', description: '', cost: '' });
  const [logSaving, setLogSaving] = useState(false);

  const [closingReport, setClosingReport] = useState<DriverReport | null>(null);
  const [repairNotes, setRepairNotes] = useState('');
  const [closeSaving, setCloseSaving] = useState(false);

  const selectedBus = useMemo(() => buses.find((b) => b.busId === selectedBusId) ?? null, [buses, selectedBusId]);

  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => { setSuccess(null); setError(null); }, 5000);
    return () => clearTimeout(t);
  }, [success, error]);

  useEffect(() => {
    setProfileForm(selectedBus?.vehicleProfile ?? EMPTY_PROFILE);
    setServiceDate(tsToInput(selectedBus?.nextServiceDueDate));
  }, [selectedBus]);

  useEffect(() => {
    if (!selectedBusId) { setFuelRecords([]); return; }
    return subscribeToFuelRecords(selectedBusId, setFuelRecords, () => setError('Could not load fuel records.'));
  }, [selectedBusId]);

  useEffect(() => {
    if (!selectedBusId) { setMaintenanceRecords([]); return; }
    return subscribeToMaintenanceRecords(selectedBusId, setMaintenanceRecords, () => setError('Could not load maintenance history.'));
  }, [selectedBusId]);

  useEffect(() => {
    return subscribeToDamageReports(setDamageReports, () => setError('Could not load repair requests.'));
  }, []);

  const busDamageReports = useMemo(
    () => damageReports.filter((r) => r.busId === selectedBusId),
    [damageReports, selectedBusId]
  );

  // Fleet-wide needs-attention: expiring/expired documents + service due, across every bus
  const needsAttention = useMemo(() => {
    const items: Array<{ busId: string; label: string; daysLeft: number; status: ExpiryStatus }> = [];
    for (const bus of buses) {
      for (const { key, label } of DOCUMENT_FIELDS) {
        const info = expiryInfo(bus.vehicleProfile?.[key] as Timestamp | null);
        if (info && info.status !== 'ok') items.push({ busId: bus.busId, label, ...info });
      }
      const service = serviceDueInfo(bus.nextServiceDueDate);
      if (service && service.status !== 'ok') items.push({ busId: bus.busId, label: 'Service', ...service });
    }
    return items.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [buses]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusId) return;
    setProfileSaving(true);
    try {
      await updateVehicleProfile(selectedBusId, profileForm);
      await setNextServiceDueDate(selectedBusId, inputToTs(serviceDate));
      setSuccess(`${selectedBusId}'s vehicle profile was saved.`);
    } catch {
      setError('Saving the vehicle profile failed.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAddFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBus || !fuelForm.date) return;
    setFuelSaving(true);
    try {
      await addFuelRecord({
        busId: selectedBus.busId,
        busNumber: selectedBus.busNumber,
        date: new Date(fuelForm.date),
        litres: Number(fuelForm.litres) || 0,
        cost: Number(fuelForm.cost) || 0,
        station: fuelForm.station.trim(),
        odometerKm: fuelForm.odometerKm ? Number(fuelForm.odometerKm) : null,
      });
      setSuccess('Fuel record added.');
      setFuelForm({ date: '', litres: '', cost: '', station: '', odometerKm: '' });
    } catch {
      setError('Adding the fuel record failed.');
    } finally {
      setFuelSaving(false);
    }
  };

  // Mileage between consecutive odometer readings, most recent first
  const mileageRows = useMemo(() => {
    const withOdo = [...fuelRecords].filter((r) => r.odometerKm != null).sort((a, b) => (a.odometerKm! - b.odometerKm!));
    const mileageByRecordId = new Map<string, number>();
    for (let i = 1; i < withOdo.length; i++) {
      const kmDiff = withOdo[i].odometerKm! - withOdo[i - 1].odometerKm!;
      if (kmDiff > 0 && withOdo[i].litres > 0) mileageByRecordId.set(withOdo[i].id, kmDiff / withOdo[i].litres);
    }
    return mileageByRecordId;
  }, [fuelRecords]);

  const handleAddMaintenanceLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBus) return;
    setLogSaving(true);
    try {
      await addMaintenanceRecord({
        busId: selectedBus.busId,
        busNumber: selectedBus.busNumber,
        category: logForm.category,
        description: logForm.description.trim(),
        cost: logForm.cost ? Number(logForm.cost) : null,
        performedAt: new Date(),
      });
      setSuccess(`Logged ${logForm.category.toLowerCase()} work on ${selectedBus.busId}.`);
      setLogForm({ category: '', description: '', cost: '' });
    } catch {
      setError('Logging the maintenance work failed.');
    } finally {
      setLogSaving(false);
    }
  };

  const handleCloseRepair = async (e: React.FormEvent) => {
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

  return (
    <>
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

      <div className="panel">
        <div className="panel-title">Needs Attention</div>
        {needsAttention.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No documents or service dates are expiring soon.</p>
        ) : (
          <div style={{ display: 'grid', gap: '.4rem' }}>
            {needsAttention.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.88rem' }}>
                <span><strong>{item.busId}</strong> — {item.label}</span>
                <span>
                  {item.status === 'expired' ? `overdue ${Math.abs(item.daysLeft)}d` : `due in ${item.daysLeft}d`}{' '}
                  {expiryBadge(item.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <Select
          label="Select a bus"
          value={selectedBusId}
          onChange={(e) => setSelectedBusId(e.target.value)}
          options={buses.map((b) => ({ value: b.busId, label: `${b.busId} · ${b.busName}` }))}
        />
      </div>

      {selectedBus && (
        <>
          <div className="two-col">
            {/* ── Vehicle profile ── */}
            <div className="panel">
              <div className="panel-title">Vehicle Profile</div>
              <form onSubmit={handleSaveProfile}>
                <Input label="Model" value={profileForm.model ?? ''} onChange={(e) => setProfileForm({ ...profileForm, model: e.target.value })} />
                <Input label="Manufacturer" value={profileForm.manufacturer ?? ''} onChange={(e) => setProfileForm({ ...profileForm, manufacturer: e.target.value })} />
                <Input label="Registration number" value={profileForm.registrationNumber ?? ''} onChange={(e) => setProfileForm({ ...profileForm, registrationNumber: e.target.value })} />
                <Input label="Engine number" value={profileForm.engineNumber ?? ''} onChange={(e) => setProfileForm({ ...profileForm, engineNumber: e.target.value })} />
                <Input label="Chassis number" value={profileForm.chassisNumber ?? ''} onChange={(e) => setProfileForm({ ...profileForm, chassisNumber: e.target.value })} />
                {DOCUMENT_FIELDS.map(({ key, label }) => (
                  <Input
                    key={key}
                    label={`${label} expiry`}
                    type="date"
                    value={tsToInput(profileForm[key] as Timestamp | null)}
                    onChange={(e) => setProfileForm({ ...profileForm, [key]: inputToTs(e.target.value) })}
                  />
                ))}
                <Input label="Next service due" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
                <Button type="submit" isLoading={profileSaving}>Save profile</Button>
              </form>
            </div>

            {/* ── Fuel log ── */}
            <div className="panel">
              <div className="panel-title">Fuel Log</div>
              <form onSubmit={handleAddFuel}>
                <Input label="Date" type="date" value={fuelForm.date} onChange={(e) => setFuelForm({ ...fuelForm, date: e.target.value })} required />
                <Input label="Litres" type="number" min={0} step="0.1" value={fuelForm.litres} onChange={(e) => setFuelForm({ ...fuelForm, litres: e.target.value })} required />
                <Input label="Cost" type="number" min={0} value={fuelForm.cost} onChange={(e) => setFuelForm({ ...fuelForm, cost: e.target.value })} required />
                <Input label="Fuel station" value={fuelForm.station} onChange={(e) => setFuelForm({ ...fuelForm, station: e.target.value })} required />
                <Input label="Odometer (km, optional)" type="number" min={0} value={fuelForm.odometerKm} onChange={(e) => setFuelForm({ ...fuelForm, odometerKm: e.target.value })} />
                <Button type="submit" isLoading={fuelSaving}>Add fuel record</Button>
              </form>

              {fuelRecords.length > 0 && (
                <div className="table-wrapper" style={{ marginTop: '1rem' }}>
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Litres</th><th>Cost</th><th>Station</th><th>Mileage</th></tr>
                    </thead>
                    <tbody>
                      {fuelRecords.map((r) => (
                        <tr key={r.id}>
                          <td>{r.date?.toDate().toLocaleDateString() ?? '—'}</td>
                          <td>{r.litres}</td>
                          <td>{r.cost}</td>
                          <td>{r.station}</td>
                          <td>{mileageRows.has(r.id) ? `${mileageRows.get(r.id)!.toFixed(1)} km/l` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="two-col">
            {/* ── Maintenance history ── */}
            <div className="panel">
              <div className="panel-title">Maintenance History</div>
              <form onSubmit={handleAddMaintenanceLog}>
                <Select
                  label="Category"
                  value={logForm.category}
                  onChange={(e) => setLogForm({ ...logForm, category: e.target.value })}
                  options={MAINTENANCE_CATEGORIES.map((c) => ({ value: c, label: c }))}
                  required
                />
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={logForm.description}
                    onChange={(e) => setLogForm({ ...logForm, description: e.target.value })}
                    required
                  />
                </div>
                <Input label="Cost (optional)" type="number" min={0} value={logForm.cost} onChange={(e) => setLogForm({ ...logForm, cost: e.target.value })} />
                <Button type="submit" isLoading={logSaving} disabled={!logForm.category || !logForm.description}>
                  Add to history
                </Button>
              </form>

              {maintenanceRecords.length > 0 && (
                <div className="table-wrapper" style={{ marginTop: '1rem' }}>
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Category</th><th>Description</th><th>Cost</th></tr>
                    </thead>
                    <tbody>
                      {maintenanceRecords.map((r) => (
                        <tr key={r.id}>
                          <td>{r.performedAt?.toDate().toLocaleDateString() ?? '—'}</td>
                          <td>{r.category}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{r.description}</td>
                          <td>{r.cost ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Repair requests for this bus ── */}
            <div className="panel">
              <div className="panel-title">Repair Requests</div>
              {busDamageReports.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No damage reports for {selectedBus.busId}.</p>
              ) : (
                <div style={{ display: 'grid', gap: '.5rem' }}>
                  {busDamageReports.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        padding: '.6rem .7rem', borderRadius: 'var(--radius)',
                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{r.category}</strong>
                        {r.status === 'open'
                          ? <Button size="sm" onClick={() => { setClosingReport(r); setRepairNotes(''); }}>Close</Button>
                          : <Badge variant="success">closed</Badge>}
                      </div>
                      {r.description && <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', margin: '.3rem 0 0' }}>{r.description}</p>}
                      {r.repairNotes && <p style={{ fontSize: '.82rem', color: 'var(--success)', margin: '.3rem 0 0' }}>Fixed: {r.repairNotes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Close repair request modal ── */}
      {closingReport && (
        <div className="modal-backdrop" onClick={() => !closeSaving && setClosingReport(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">Close {closingReport.busNumber}'s repair request</h2>
            <form onSubmit={handleCloseRepair}>
              <div className="form-group">
                <label className="form-label">Repair notes (optional)</label>
                <textarea className="form-control" rows={3} value={repairNotes} onChange={(e) => setRepairNotes(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="secondary" onClick={() => setClosingReport(null)} disabled={closeSaving}>Cancel</Button>
                <Button type="submit" isLoading={closeSaving}>Mark closed</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
