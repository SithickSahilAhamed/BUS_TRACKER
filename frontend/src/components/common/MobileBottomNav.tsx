/**
 * Bottom tab bar for mobile-first roles (Student/Professor/Driver), per the
 * Agni design system's driver_operations/student_live_map references.
 * Deliberately generic — each page builds its own 5-tab array so it decides
 * exactly what "Home"/"Track"/"AI"/"Alerts"/"Profile" mean for that role
 * (this app doesn't have dedicated Home/Profile pages, so those tabs call
 * back into existing behavior — e.g. Profile triggers the existing Logout).
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export interface BottomNavTab {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to?: string;
  onClick?: () => void;
}

interface MobileBottomNavProps {
  tabs: BottomNavTab[];
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ tabs }) => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-surface border-t border-outline-variant shadow-overlay flex justify-around items-center px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
      {tabs.map((tab) => {
        const isActive = tab.to ? location.pathname === tab.to : false;
        const className = `flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition-transform active:scale-90 no-underline ${
          isActive ? 'text-primary font-bold' : 'text-on-surface-variant'
        }`;
        const content = (
          <>
            <tab.icon className="w-5 h-5" />
            <span className="font-label-md text-[10px]">{tab.label}</span>
          </>
        );
        return tab.to ? (
          <Link key={tab.key} to={tab.to} className={className}>
            {content}
          </Link>
        ) : (
          <button key={tab.key} onClick={tab.onClick} className={className}>
            {content}
          </button>
        );
      })}
    </nav>
  );
};
