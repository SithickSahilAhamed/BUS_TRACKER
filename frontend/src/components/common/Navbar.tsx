import React from 'react';

interface NavbarProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBackClick?: () => void;
  rightAction?: React.ReactNode;
}

export const Navbar: React.FC<NavbarProps> = ({
  title,
  subtitle,
  showBackButton,
  onBackClick,
  rightAction,
}) => {
  return (
    <nav className="campus-nav">
      <div className="campus-nav-inner">
        <div className="campus-nav-left">
          {showBackButton && (
            <button onClick={onBackClick} className="btn btn-ghost btn-icon" aria-label="Go back">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <div className="campus-nav-title">{title}</div>
            {subtitle && <div className="campus-nav-subtitle">{subtitle}</div>}
          </div>
        </div>
        {rightAction && <div className="campus-nav-right">{rightAction}</div>}
      </div>
    </nav>
  );
};
