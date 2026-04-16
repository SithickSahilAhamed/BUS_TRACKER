/**
 * DRIVER LOGIN PAGE
 * Authenticates driver with Bus ID + PIN against backend
 * On success stores token in localStorage and redirects to /driver
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const DriverLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [busId, setBusId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busId.trim() || !pin.trim()) {
      setError('Please enter both Bus ID and PIN.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/driver/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ busId: busId.trim(), pin }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || 'Login failed. Check your Bus ID and PIN.');
        return;
      }

      localStorage.setItem('authToken', data.token);
      localStorage.setItem('driverBusId', data.busId);
      localStorage.setItem('driverBusName', data.busName || data.busId);
      navigate('/driver');
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
          <div style={{ fontSize: '2.4rem', marginBottom: '0.5rem' }}>🚌</div>
          <h1 className="login-title">Driver Login</h1>
          <p className="login-subtitle">Enter your Bus ID and PIN to start tracking</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Bus ID</label>
            <input
              className="form-control"
              type="text"
              placeholder="e.g. BUS001"
              value={busId}
              onChange={(e) => setBusId(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">PIN</label>
            <input
              className="form-control"
              type="password"
              placeholder="4-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              maxLength={8}
              autoComplete="current-password"
            />
          </div>

          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={isLoading}
            style={{ marginTop: '0.5rem' }}
          >
            {isLoading ? 'Signing in…' : 'Start Driving'}
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
          Default PIN is <strong style={{ color: 'rgba(255,255,255,0.75)' }}>1234</strong>
          <br />Contact admin to change your PIN
        </div>
      </div>
    </div>
  );
};

export default DriverLoginPage;
