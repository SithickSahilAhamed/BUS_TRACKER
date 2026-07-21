/**
 * PRINCIPAL DASHBOARD
 * Principal/Management role (PROJECT_SPEC.md sections 1.6 + 6): read-only
 * fleet oversight. Reuses AdminDashboard's AnalyticsTab wholesale (same
 * Fuel/Route/Student/Driver Analysis, now also readable by isPrincipal()
 * in firestore.rules) plus a Budget summary and the Principal AI persona.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/common';
import { AnalyticsTab } from '../components/admin/AnalyticsTab';
import { ChatAssistant } from '../components/ChatAssistant';
import { NotificationBell } from '../components/NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useBuses } from '../hooks/useBuses';
import { subscribeToStudents, subscribeToAllFuelRecords, subscribeToAllMaintenanceRecords } from '../services/firestore';
import type { UserProfile, FuelRecord, MaintenanceRecord } from '../types';

const PrincipalPanelPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { buses } = useBuses();
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);

  useEffect(() => subscribeToStudents(setStudents, () => {}), []);
  useEffect(() => subscribeToAllFuelRecords(setFuelRecords, () => {}), []);
  useEffect(() => subscribeToAllMaintenanceRecords(setMaintenanceRecords, () => {}), []);

  const onTripCount = useMemo(() => buses.filter((b) => b.isActive).length, [buses]);
  const totalFuelCost = useMemo(() => fuelRecords.reduce((sum, r) => sum + r.cost, 0), [fuelRecords]);
  const totalMaintenanceCost = useMemo(
    () => maintenanceRecords.reduce((sum, r) => sum + (r.cost ?? 0), 0),
    [maintenanceRecords]
  );

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const buildChatContext = () => ({
    fleetSummary: { totalBuses: buses.length, onTripNow: onTripCount, totalStudents: students.length },
    budget: { totalFuelCost, totalMaintenanceCost, totalBudget: totalFuelCost + totalMaintenanceCost },
    buses: buses.map((b) => ({ busId: b.busId, routeName: b.routeName, capacity: b.capacity, isActive: b.isActive })),
  });

  return (
    <div className="campus-shell">
      <Navbar
        title="Principal Dashboard"
        subtitle={profile ? profile.name : 'Agni College of Technology'}
        rightAction={
          <>
            <NotificationBell />
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
          </>
        }
      />

      <div className="campus-section">
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
            <div className="metric-label">Students transported</div>
            <div className="metric-value">{students.filter((s) => s.assignedBusId).length}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Fuel spend</div>
            <div className="metric-value">₹{totalFuelCost.toFixed(0)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Maintenance spend</div>
            <div className="metric-value">₹{totalMaintenanceCost.toFixed(0)}</div>
          </div>
        </div>

        <AnalyticsTab buses={buses} students={students} />
      </div>

      <ChatAssistant title="Principal Assistant" examplePrompt="What's our fleet utilization?" buildContext={buildChatContext} />
    </div>
  );
};

export default PrincipalPanelPage;
