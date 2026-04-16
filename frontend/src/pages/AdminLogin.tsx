/**
 * ADMIN LOGIN PAGE
 * Authenticates admin with email + password
 * On success stores token in localStorage and redirects to /admin
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || 'Login failed. Check your credentials.');
        return;
      }

      localStorage.setItem('authToken', data.token);
      localStorage.setItem('adminEmail', data.email);
      navigate('/admin');
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: '0.5rem' }}>⚙️</div>
          <h1 className="login-title">Admin Login</h1>
          <p className="login-subtitle">Manage buses, routes and drivers</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-control"
              type="email"
              placeholder="admin@bustrack.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-control"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={isLoading}
            style={{ marginTop: '0.5rem' }}
          >
            {isLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/')}
            style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}
          >
            ← Back to home
          </button>
        </div>

        <div style={{
          marginTop: '1.5rem',
          padding: '0.75rem 1rem',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 8,
          fontSize: '0.8rem',
          color: 'rgba(255,255,255,0.5)',
          textAlign: 'center',
        }}>
          Default: <strong style={{ color: 'rgba(255,255,255,0.75)' }}>admin@bustrack.com / admin123</strong>
          <br />Change via <code style={{ color: 'rgba(255,255,255,0.6)' }}>ADMIN_EMAIL</code> / <code style={{ color: 'rgba(255,255,255,0.6)' }}>ADMIN_PASSWORD</code> env vars
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
