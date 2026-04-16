/**
 * Main App Router
 * Routes for Student, Driver, Admin — with login guards
 */

import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoadingSpinner } from './components/common';
import HomePage from './pages/Home';
import StudentMapPage from './pages/StudentMap';
import DriverLoginPage from './pages/DriverLogin';
import DriverPanelPage from './pages/DriverPanel';
import AdminLoginPage from './pages/AdminLogin';
import AdminDashboardPage from './pages/AdminDashboard';

// Redirect to login if no token stored
const RequireDriverAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('authToken');
  const busId = localStorage.getItem('driverBusId');
  if (!token || !busId) return <Navigate to="/driver/login" replace />;
  return <>{children}</>;
};

const RequireAdminAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('authToken');
  const email = localStorage.getItem('adminEmail');
  if (!token || !email) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
};

const LoadingFallback = () => (
  <LoadingSpinner label="Loading…" />
);

function App() {
  return (
    <Router>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Home */}
          <Route path="/" element={<HomePage />} />

          {/* Student — no auth required, anyone can track */}
          <Route path="/student" element={<StudentMapPage />} />
          <Route path="/map" element={<StudentMapPage />} />

          {/* Driver */}
          <Route path="/driver/login" element={<DriverLoginPage />} />
          <Route
            path="/driver"
            element={
              <RequireDriverAuth>
                <DriverPanelPage />
              </RequireDriverAuth>
            }
          />

          {/* Admin */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route
            path="/admin"
            element={
              <RequireAdminAuth>
                <AdminDashboardPage />
              </RequireAdminAuth>
            }
          />
          <Route
            path="/admin/buses"
            element={
              <RequireAdminAuth>
                <AdminDashboardPage />
              </RequireAdminAuth>
            }
          />
          <Route
            path="/admin/routes"
            element={
              <RequireAdminAuth>
                <AdminDashboardPage />
              </RequireAdminAuth>
            }
          />
          <Route
            path="/admin/drivers"
            element={
              <RequireAdminAuth>
                <AdminDashboardPage />
              </RequireAdminAuth>
            }
          />
          <Route
            path="/admin/tracking"
            element={
              <RequireAdminAuth>
                <AdminDashboardPage />
              </RequireAdminAuth>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
