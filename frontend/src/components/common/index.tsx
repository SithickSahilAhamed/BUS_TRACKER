import React from 'react';
import IconLoader from '~icons/material-symbols/progress-activity';
export { Navbar } from './Navbar';
export { MobileBottomNav } from './MobileBottomNav';
export type { BottomNavTab } from './MobileBottomNav';

export const LoadingSpinner: React.FC<{ label?: string }> = ({ label = 'Loading' }) => (
  <div className="flex flex-col items-center justify-center gap-sm py-2xl text-on-surface-variant">
    <IconLoader className="w-8 h-8 text-primary animate-spin" />
    <p className="font-label-md text-label-md uppercase tracking-wider">{label}</p>
  </div>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'accent' | 'ghost';
  isLoading?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const BUTTON_VARIANT_CLASS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90 border border-primary',
  // "AI/Urgent" per DESIGN.md: accent_color background, used sparingly.
  accent: 'bg-accent text-on-accent hover:opacity-90 border border-accent font-bold',
  secondary: 'bg-transparent text-primary border border-outline-variant hover:bg-surface-container-high',
  danger: 'bg-error text-on-error hover:opacity-90 border border-error',
  ghost: 'bg-transparent text-on-surface-variant border border-transparent hover:bg-surface-container-high',
};

const BUTTON_SIZE_CLASS: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-md py-xs text-label-md font-label-md',
  md: 'px-lg py-sm text-body-md font-body-md',
  lg: 'px-xl py-md text-title-lg font-title-lg',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  isLoading = false,
  fullWidth = false,
  size = 'md',
  children,
  className = '',
  disabled,
  ...props
}) => (
  <button
    className={[
      'inline-flex items-center justify-center gap-sm rounded font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
      BUTTON_VARIANT_CLASS[variant],
      BUTTON_SIZE_CLASS[size],
      fullWidth ? 'w-full' : '',
      className,
    ].join(' ')}
    disabled={disabled || isLoading}
    {...props}
  >
    {isLoading && <IconLoader className="w-4 h-4 animate-spin" />}
    {children}
  </button>
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string | number; label: string }>;
}

const fieldBaseClass =
  'w-full bg-surface-container-lowest border rounded-md px-md py-sm text-body-md font-body-md text-on-surface focus:outline-none focus:border-primary transition-colors';

export const Select: React.FC<SelectProps> = ({ label, error, options, className = '', ...props }) => (
  <div className="mb-md">
    {label && <label className="block mb-xs font-label-md text-label-md text-on-surface-variant">{label}</label>}
    <select
      className={[fieldBaseClass, error ? 'border-error' : 'border-outline-variant', className].join(' ')}
      {...props}
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    {error && <p className="mt-xs text-label-md text-error">{error}</p>}
  </div>
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => (
  <div className="mb-md">
    {label && <label className="block mb-xs font-label-md text-label-md text-on-surface-variant">{label}</label>}
    <input
      className={[fieldBaseClass, error ? 'border-error' : 'border-outline-variant', className].join(' ')}
      {...props}
    />
    {error && <p className="mt-xs text-label-md text-error">{error}</p>}
  </div>
);

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ label, error, className = '', ...props }) => (
  <div className="mb-md">
    {label && <label className="block mb-xs font-label-md text-label-md text-on-surface-variant">{label}</label>}
    <textarea
      className={[fieldBaseClass, 'resize-y', error ? 'border-error' : 'border-outline-variant', className].join(' ')}
      {...props}
    />
    {error && <p className="mt-xs text-label-md text-error">{error}</p>}
  </div>
);

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => (
  <div
    className={[
      'bg-surface-container-lowest border border-outline-variant rounded-xl p-lg',
      onClick ? 'cursor-pointer hover:border-primary transition-colors' : '',
      className,
    ].join(' ')}
    onClick={onClick}
  >
    {children}
  </div>
);

interface AlertProps {
  type: 'error' | 'success' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
}

const ALERT_CLASS: Record<AlertProps['type'], string> = {
  error: 'bg-error-container text-on-error-container border-error/20',
  success: 'bg-green-100 text-green-800 border-green-600/20',
  warning: 'bg-tertiary-fixed text-on-tertiary-fixed-variant border-tertiary/20',
  info: 'bg-secondary-fixed text-on-secondary-fixed-variant border-secondary/20',
};

export const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => (
  <div className={`flex items-center justify-between gap-md p-md rounded-lg border ${ALERT_CLASS[type]} mb-md`}>
    <p className="font-body-md text-body-md">{message}</p>
    {onClose && (
      <button onClick={onClose} className="font-label-md text-label-md font-bold underline shrink-0">
        Close
      </button>
    )}
  </div>
);

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'danger' | 'warning' | 'info';
}

// Chips/Status per DESIGN.md: subtle tint background, uppercase label-md text.
const BADGE_CLASS: Record<NonNullable<BadgeProps['variant']>, string> = {
  success: 'bg-green-100 text-green-800',
  danger: 'bg-error-container text-on-error-container',
  warning: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  info: 'bg-secondary-fixed text-on-secondary-fixed-variant',
};

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'info' }) => (
  <span
    className={`inline-flex items-center px-sm py-[2px] rounded-full font-label-md text-label-md uppercase tracking-wider ${BADGE_CLASS[variant]}`}
  >
    {children}
  </span>
);
