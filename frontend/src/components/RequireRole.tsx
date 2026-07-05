import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from './common';
import type { UserRole } from '../types';

interface RequireRoleProps {
  roles: UserRole[];
  children: React.ReactNode;
}

/**
 * Route guard. While auth state is resolving it shows a spinner (so a page
 * refresh doesn't bounce a logged-in user to /login). Unauthenticated users
 * go to /login; authenticated users without an allowed role go to /map
 * (or / if they can't even view the map).
 */
export const RequireRole: React.FC<RequireRoleProps> = ({ roles, children }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="full-center">
        <LoadingSpinner label="Checking your session…" />
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!roles.includes(profile.role)) {
    // Every role may view the map, so it's a safe landing spot
    return <Navigate to={location.pathname === '/map' ? '/' : '/map'} replace />;
  }

  return <>{children}</>;
};
