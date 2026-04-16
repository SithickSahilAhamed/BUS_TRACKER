import React from 'react';
export { Navbar } from './Navbar';

export const LoadingSpinner: React.FC<{ label?: string }> = ({ label = 'Loading' }) => (
  <div className="loading-block">
    <div className="spinner" />
    <p className="loading-label">{label}</p>
  </div>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  isLoading = false,
  fullWidth = false,
  size = 'md',
  children,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  const variantClass =
    variant === 'secondary' ? 'btn-secondary' : variant === 'danger' ? 'btn-danger' : 'btn-primary';
  const widthClass = fullWidth ? 'btn-block' : '';

  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${widthClass} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
      {children}
    </button>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string | number; label: string }>;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  className = '',
  ...props
}) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    <select
      className={`form-control ${error ? 'form-control-error' : ''} ${className}`}
      {...props}
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    {error && <p className="form-error">{error}</p>}
  </div>
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => (
  <div className="form-group">
    {label && <label className="form-label">{label}</label>}
    <input
      className={`form-control ${error ? 'form-control-error' : ''} ${className}`}
      {...props}
    />
    {error && <p className="form-error">{error}</p>}
  </div>
);

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => (
  <div
    className={`card ${onClick ? 'card-interactive' : ''} ${className}`}
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

export const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
  const className =
    type === 'error'
      ? 'alert alert-error'
      : type === 'success'
      ? 'alert alert-success'
      : type === 'warning'
      ? 'alert alert-warning'
      : 'alert alert-info';

  return (
    <div className={className}>
      <p>{message}</p>
      {onClose && (
        <button onClick={onClose} className="btn btn-ghost btn-sm">
          Close
        </button>
      )}
    </div>
  );
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'danger' | 'warning' | 'info';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'info' }) => {
  const className =
    variant === 'success'
      ? 'badge badge-success'
      : variant === 'danger'
      ? 'badge badge-danger'
      : variant === 'warning'
      ? 'badge badge-warning'
      : 'badge badge-info';

  return <span className={className}>{children}</span>;
};
