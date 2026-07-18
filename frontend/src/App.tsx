/**
 * Main App Router
 * Public: home, login, signup. Everything else is role-gated via RequireRole.
 */

import { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoadingSpinner } from './components/common';
import { RequireRole } from './components/RequireRole';
import HomePage from './pages/Home';
import LoginPage from './pages/Login';
import SignupPage from './pages/Signup';
import StudentMapPage from './pages/StudentMap';
import DriverPanelPage from './pages/DriverPanel';
import AdminDashboardPage from './pages/AdminDashboard';
import MaintenancePanelPage from './pages/MaintenancePanel';

const LoadingFallback = () => <LoadingSpinner label="Loading…" />;

function App() {
  return (
    <Router>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Branded per-role sign-in doors */}
          <Route path="/driver/login" element={<LoginPage variant="driver" />} />
          <Route path="/admin/login" element={<LoginPage variant="admin" />} />
          <Route path="/maintenance/login" element={<LoginPage variant="maintenance" />} />

          {/* Live map — any signed-in role */}
          {['/student', '/map'].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                <RequireRole roles={['student', 'professor', 'driver', 'admin', 'maintenance']}>
                  <StudentMapPage />
                </RequireRole>
              }
            />
          ))}

          {/* Driver */}
          <Route
            path="/driver"
            element={
              <RequireRole roles={['driver']}>
                <DriverPanelPage />
              </RequireRole>
            }
          />

          {/* Maintenance */}
          <Route
            path="/maintenance"
            element={
              <RequireRole roles={['maintenance']}>
                <MaintenancePanelPage />
              </RequireRole>
            }
          />

          {/* Admin */}
          {['/admin', '/admin/buses', '/admin/drivers', '/admin/students', '/admin/reports', '/admin/attendance', '/admin/maintenance', '/admin/tracking'].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                <RequireRole roles={['admin']}>
                  <AdminDashboardPage />
                </RequireRole>
              }
            />
          ))}

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
