import React from 'react';
import IconBack from '~icons/material-symbols/arrow-back-ios-new';

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
    <nav className="sticky top-0 z-40 bg-surface border-b border-outline-variant h-16 flex items-center justify-between px-gutter">
      <div className="flex items-center gap-md min-w-0">
        {showBackButton && (
          <button
            onClick={onBackClick}
            aria-label="Go back"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <IconBack className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0">
          <div className="font-headline-md text-title-lg font-bold text-primary truncate">{title}</div>
          {subtitle && (
            <div className="font-body-md text-label-md text-on-surface-variant truncate">{subtitle}</div>
          )}
        </div>
      </div>
      {rightAction && <div className="flex items-center gap-sm shrink-0">{rightAction}</div>}
    </nav>
  );
};
