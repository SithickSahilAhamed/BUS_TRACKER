import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

interface SidebarLink {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const links: SidebarLink[] = [
  {
    label: 'Dashboard',
    path: '/admin',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m0 0l4 4m-4-4v4" />
      </svg>
    ),
  },
  {
    label: 'Buses',
    path: '/admin/buses',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12M8 7a2 2 0 100-4 2 2 0 000 4zm0 0H6a3 3 0 00-3 3v8a3 3 0 003 3h12a3 3 0 003-3V10a3 3 0 00-3-3h-2M8 7v10m4-10v10m4-10v10" />
      </svg>
    ),
  },
  {
    label: 'Drivers',
    path: '/admin/drivers',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 8.646 4 4 0 010-8.646M9 9H3v7a3 3 0 003 3h12a3 3 0 003-3v-7h-6" />
      </svg>
    ),
  },
  {
    label: 'Routes',
    path: '/admin/routes',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 003 16.382V5.618a1 1 0 011.553-.894L9 7.5m0 0l6.553-3.276A1 1 0 0117 5.618v10.764a1 1 0 01-1.447.894L9 12.5m0 0v7" />
      </svg>
    ),
  },
  {
    label: 'Live Tracking',
    path: '/admin/tracking',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
];

export const AdminSidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('adminEmail');
    navigate('/admin/login');
  };

  return (
    <div className={`admin-sidebar ${isOpen ? '' : 'compact'}`}>
      <button onClick={() => setIsOpen(!isOpen)} className="sidebar-toggle" aria-label="Toggle sidebar">
        {isOpen ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>

      {isOpen && <div className="sidebar-brand">Campus Ops</div>}

      <nav className="sidebar-links">
        {links.map((link) => {
          const isActive = location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
              title={!isOpen ? link.label : undefined}
            >
              {link.icon}
              {isOpen && <span>{link.label}</span>}
            </Link>
          );
        })}
      </nav>

      {isOpen && (
        <div className="sidebar-footer">
          <button className="btn btn-danger btn-block" onClick={handleLogout}>Logout</button>
        </div>
      )}
    </div>
  );
};
