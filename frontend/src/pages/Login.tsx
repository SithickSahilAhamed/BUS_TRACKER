import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';

export type LoginVariant = 'general' | 'driver' | 'admin' | 'maintenance' | 'parent' | 'principal';

const homeForRole = (role: UserRole): string => {
  if (role === 'admin') return '/admin';
  if (role === 'driver') return '/driver';
  if (role === 'maintenance') return '/maintenance';
  if (role === 'parent') return '/parent';
  if (role === 'principal') return '/principal';
  return '/map';
};

// Per-door branding and wrong-door handling
const VARIANTS: Record<
  LoginVariant,
  { icon: string; title: string; subtitle: string; accent: string; expect?: UserRole; showSignup: boolean }
> = {
  general: {
    icon: '🎓',
    title: 'Student & Staff Sign In',
    subtitle: 'For students and professors of Agni College',
    accent: '#4aa3df',
    showSignup: true,
  },
  driver: {
    icon: '🚍',
    title: 'Driver Sign In',
    subtitle: 'Use the login your admin gave you',
    accent: '#1b7a5a',
    expect: 'driver',
    showSignup: false,
  },
  admin: {
    icon: '🛡️',
    title: 'Admin Sign In',
    subtitle: 'Manage buses, drivers and live tracking',
    accent: '#e0b84c',
    expect: 'admin',
    showSignup: false,
  },
  maintenance: {
    icon: '🔧',
    title: 'Maintenance Sign In',
    subtitle: 'Use the login your admin gave you',
    accent: '#c2571f',
    expect: 'maintenance',
    showSignup: false,
  },
  parent: {
    icon: '👪',
    title: 'Parent Sign In',
    subtitle: 'Use the login your admin gave you',
    accent: '#7c5cbf',
    expect: 'parent',
    showSignup: false,
  },
  principal: {
    icon: '🎓',
    title: 'Principal / Management Sign In',
    subtitle: 'Use the login your admin gave you',
    accent: '#2d6b6b',
    expect: 'principal',
    showSignup: false,
  },
};

const friendlyError = (code: string): string => {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a few minutes.';
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/network-request-failed':
      return 'Network error — check your internet connection.';
    default:
      return 'Login failed. Please try again.';
  }
};

interface LoginPageProps {
  variant?: LoginVariant;
}

const LoginPage: React.FC<LoginPageProps> = ({ variant = 'general' }) => {
  const cfg = VARIANTS[variant];
  const navigate = useNavigate();
  const { user, profile, loading, login, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect once the profile arrives. If someone uses the wrong door
  // (e.g. an admin on the driver page), send them to their own home.
  useEffect(() => {
    if (!loading && profile) {
      if (cfg.expect && profile.role !== cfg.expect) {
        setError(
          `This is the ${cfg.expect} sign-in, but your account is a ${profile.role} account. Taking you to your area…`
        );
        const t = setTimeout(() => navigate(homeForRole(profile.role), { replace: true }), 1400);
        return () => clearTimeout(t);
      }
      navigate(homeForRole(profile.role), { replace: true });
    }
  }, [loading, profile, navigate, cfg.expect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // navigation happens in the effect above once the profile loads
    } catch (err: any) {
      setError(friendlyError(err?.code ?? ''));
      setSubmitting(false);
    }
  };

  // Signed in but no Firestore profile — account wasn't finished being set up
  const missingProfile = !loading && user && !profile;

  return (
    <div className="login-wrapper">
      <div className="login-card" style={{ borderTop: `4px solid ${cfg.accent}` }}>
        <h1 className="login-title">
          <span style={{ marginRight: 8 }}>{cfg.icon}</span>
          {cfg.title}
        </h1>
        <p className="login-subtitle">{cfg.subtitle}</p>

        {error && <div className="login-error">{error}</div>}
        {missingProfile && (
          <div className="login-error">
            Your account exists but has no profile yet. Ask the admin to finish setting it up.
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 8, color: '#ff8a80' }}
              onClick={() => logout()}
            >
              Sign out
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-control"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-block btn-lg"
            style={{ background: cfg.accent, color: variant === 'admin' ? '#0f1d2e' : '#fff' }}
            disabled={submitting || (!loading && !!profile)}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {cfg.showSignup && (
          <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'rgba(255,255,255,.6)', fontSize: '.9rem' }}>
            New student or professor?{' '}
            <Link to="/signup" style={{ color: '#8ecdf7', fontWeight: 600 }}>
              Create an account
            </Link>
          </p>
        )}

        {/* Cross-links to the other doors */}
        <div style={{ textAlign: 'center', marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {variant !== 'general' && (
            <Link to="/login" style={{ color: 'rgba(255,255,255,.5)', fontSize: '.82rem' }}>
              Student / Staff login
            </Link>
          )}
          {variant !== 'driver' && (
            <Link to="/driver/login" style={{ color: 'rgba(255,255,255,.5)', fontSize: '.82rem' }}>
              Driver login
            </Link>
          )}
          {variant !== 'admin' && (
            <Link to="/admin/login" style={{ color: 'rgba(255,255,255,.5)', fontSize: '.82rem' }}>
              Admin login
            </Link>
          )}
          {variant !== 'maintenance' && (
            <Link to="/maintenance/login" style={{ color: 'rgba(255,255,255,.5)', fontSize: '.82rem' }}>
              Maintenance login
            </Link>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/" style={{ color: 'rgba(255,255,255,.45)', fontSize: '.85rem' }}>
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
