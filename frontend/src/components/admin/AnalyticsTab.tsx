/**
 * Analytics tab (PROJECT_SPEC.md section 6 — the non-chat half). Plain
 * client-side aggregation over data the app already collects; no AI
 * involved here (see MaintenancePanel/AdminDashboard's AI Assistant for
 * the LLM-backed half). "Predictive Maintenance" and "delays" from the
 * spec aren't included — see CLAUDE.md for why.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { subscribeToAllFuelRecords, subscribeToTrips } from '../../services/firestore';
import { ExportButtons } from '../common/ExportButtons';
import type { Bus, FuelRecord, TripRecord, UserProfile } from '../../types';

interface Props {
  buses: Bus[];
  students: UserProfile[];
}

export const AnalyticsTab: React.FC<Props> = ({ buses, students }) => {
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);

  useEffect(() => subscribeToAllFuelRecords(setFuelRecords, () => {}), []);
  useEffect(() => subscribeToTrips(setTrips, () => {}), []);

  // ── Fuel Analysis: per bus, total litres/cost + mileage from consecutive odometer readings ──
  const fuelByBus = useMemo(() => {
    return buses.map((bus) => {
      const records = fuelRecords.filter((r) => r.busId === bus.busId);
      const totalLitres = records.reduce((sum, r) => sum + r.litres, 0);
      const totalCost = records.reduce((sum, r) => sum + r.cost, 0);

      const withOdo = [...records].filter((r) => r.odometerKm != null).sort((a, b) => a.odometerKm! - b.odometerKm!);
      let kmSum = 0;
      let litreSum = 0;
      for (let i = 1; i < withOdo.length; i++) {
        const kmDiff = withOdo[i].odometerKm! - withOdo[i - 1].odometerKm!;
        if (kmDiff > 0 && withOdo[i].litres > 0) { kmSum += kmDiff; litreSum += withOdo[i].litres; }
      }
      const avgMileage = litreSum > 0 ? kmSum / litreSum : null;

      return { bus, totalLitres, totalCost, avgMileage, recordCount: records.length };
    }).sort((a, b) => b.totalCost - a.totalCost);
  }, [buses, fuelRecords]);

  // ── Route Analysis: ridership per route (this app's buses own their route 1:1) ──
  const riderCountByBus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of students) {
      if (s.assignedBusId) counts.set(s.assignedBusId, (counts.get(s.assignedBusId) ?? 0) + 1);
    }
    return counts;
  }, [students]);

  const routeAnalysis = useMemo(() => {
    return buses
      .map((bus) => {
        const riders = riderCountByBus.get(bus.busId) ?? 0;
        const utilization = bus.capacity > 0 ? Math.round((riders / bus.capacity) * 100) : null;
        return { bus, riders, utilization };
      })
      .sort((a, b) => b.riders - a.riders);
  }, [buses, riderCountByBus]);

  // ── Student Analysis: most-used stops ──
  const topStops = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of students) {
      if (s.assignedStopName) counts.set(s.assignedStopName, (counts.get(s.assignedStopName) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [students]);

  // ── Driver Analysis: trip count + average duration per driver ──
  const driverAnalysis = useMemo(() => {
    const byDriver = new Map<string, { driverName: string; trips: TripRecord[] }>();
    for (const t of trips) {
      const entry = byDriver.get(t.driverId) ?? { driverName: t.driverName, trips: [] };
      entry.trips.push(t);
      byDriver.set(t.driverId, entry);
    }
    return [...byDriver.values()]
      .map(({ driverName, trips: driverTrips }) => ({
        driverName,
        tripCount: driverTrips.length,
        avgDurationMinutes: Math.round(driverTrips.reduce((sum, t) => sum + t.durationMinutes, 0) / driverTrips.length),
      }))
      .sort((a, b) => b.tripCount - a.tripCount);
  }, [trips]);

  const fuelRows: (string | number)[][] = fuelByBus
    .filter((f) => f.recordCount > 0)
    .map(({ bus, totalLitres, totalCost, avgMileage }) => [
      bus.busId, totalLitres.toFixed(1), totalCost.toFixed(0), avgMileage != null ? avgMileage.toFixed(1) : '—',
    ]);
  const routeRows: (string | number)[][] = routeAnalysis.map(({ bus, riders, utilization }) => [
    bus.busId, bus.routeName || bus.busName, riders, utilization != null ? `${utilization}%` : '—',
  ]);
  const stopRows: (string | number)[][] = topStops.map(({ name, count }) => [name, count]);
  const driverRows: (string | number)[][] = driverAnalysis.map(({ driverName, tripCount, avgDurationMinutes }) => [
    driverName, tripCount, avgDurationMinutes,
  ]);

  return (
    <>
      <div className="two-col">
        <div className="panel">
          <div className="section-header">
            <div className="panel-title" style={{ marginBottom: 0 }}>Fuel Analysis</div>
            <ExportButtons title="Fuel Analysis" columns={['Bus', 'Litres', 'Cost', 'Avg Mileage']} rows={fuelRows} />
          </div>
          {fuelByBus.every((f) => f.recordCount === 0) ? (
            <p style={{ color: 'var(--text-muted)' }}>No fuel records yet — add some from the Fleet Maintenance tab.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Bus</th><th>Litres</th><th>Cost</th><th>Avg mileage</th></tr>
                </thead>
                <tbody>
                  {fuelByBus.filter((f) => f.recordCount > 0).map(({ bus, totalLitres, totalCost, avgMileage }) => (
                    <tr key={bus.busId}>
                      <td><strong>{bus.busId}</strong></td>
                      <td>{totalLitres.toFixed(1)}</td>
                      <td>{totalCost.toFixed(0)}</td>
                      <td>{avgMileage != null ? `${avgMileage.toFixed(1)} km/l` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="section-header">
            <div className="panel-title" style={{ marginBottom: 0 }}>Route Analysis</div>
            <ExportButtons title="Route Analysis" columns={['Bus', 'Route', 'Riders', 'Utilization']} rows={routeRows} />
          </div>
          {routeAnalysis.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No buses yet.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Route</th><th>Riders</th><th>Utilization</th></tr>
                </thead>
                <tbody>
                  {routeAnalysis.map(({ bus, riders, utilization }) => (
                    <tr key={bus.busId}>
                      <td><strong>{bus.busId}</strong> <span style={{ color: 'var(--text-muted)' }}>{bus.routeName || bus.busName}</span></td>
                      <td>{riders}</td>
                      <td>{utilization != null ? `${utilization}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="section-header">
            <div className="panel-title" style={{ marginBottom: 0 }}>Student Analysis — Most-Used Stops</div>
            <ExportButtons title="Student Analysis" columns={['Stop', 'Students']} rows={stopRows} />
          </div>
          {topStops.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No students assigned to a stop yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '.4rem' }}>
              {topStops.map(({ name, count }) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.88rem' }}>
                  <span>{name}</span>
                  <strong>{count} student{count === 1 ? '' : 's'}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="section-header">
            <div className="panel-title" style={{ marginBottom: 0 }}>Driver Analysis</div>
            <ExportButtons title="Driver Analysis" columns={['Driver', 'Trips', 'Avg Duration (min)']} rows={driverRows} />
          </div>
          {driverAnalysis.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No completed trips yet — logged automatically at End Trip.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Driver</th><th>Trips</th><th>Avg duration</th></tr>
                </thead>
                <tbody>
                  {driverAnalysis.map(({ driverName, tripCount, avgDurationMinutes }) => (
                    <tr key={driverName}>
                      <td><strong>{driverName}</strong></td>
                      <td>{tripCount}</td>
                      <td>{avgDurationMinutes} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
