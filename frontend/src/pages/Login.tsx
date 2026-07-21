import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Input, Button } from '../components/common';
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

// Per-door branding and wrong-door handling. These accent colors are
// deliberate per-role identity, kept distinct from the Agni design system's
// primary/secondary tokens on purpose — no reference screen covers this
// page, so role recognition at a glance takes priority here.
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
    <div className="min-h-screen flex items-center justify-center bg-surface-container-low px-md py-2xl">
      <div className="w-full max-w-sm bg-surface-container-lowest rounded-xl border border-outline-variant p-xl" style={{ borderTop: `4px solid ${cfg.accent}` }}>
        <h1 className="font-headline-md text-headline-md text-on-surface flex items-center gap-sm mb-xs">
          <span>{cfg.icon}</span>
          {cfg.title}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-lg">{cfg.subtitle}</p>

        {error && (
          <div className="mb-md p-sm rounded-lg bg-error-container text-on-error-container text-body-md">
            {error}
          </div>
        )}
        {missingProfile && (
          <div className="mb-md p-sm rounded-lg bg-error-container text-on-error-container text-body-md flex items-center justify-between gap-sm">
            <span>Your account exists but has no profile yet. Ask the admin to finish setting it up.</span>
            <button className="font-label-md text-label-md font-bold underline shrink-0" onClick={() => logout()}>
              Sign out
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button
            type="submit"
            fullWidth
            size="lg"
            className="mt-sm"
            style={{ background: cfg.accent, borderColor: cfg.accent, color: variant === 'admin' ? '#0f1d2e' : '#fff' }}
            disabled={submitting || (!loading && !!profile)}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        {cfg.showSignup && (
          <p className="text-center mt-lg text-body-md text-on-surface-variant">
            New student or professor?{' '}
            <Link to="/signup" className="font-bold text-secondary no-underline">
              Create an account
            </Link>
          </p>
        )}

        {/* Cross-links to the other doors */}
        <div className="flex flex-wrap gap-md justify-center mt-md">
          {variant !== 'general' && (
            <Link to="/login" className="text-label-md text-on-surface-variant hover:text-primary no-underline">
              Student / Staff login
            </Link>
          )}
          {variant !== 'driver' && (
            <Link to="/driver/login" className="text-label-md text-on-surface-variant hover:text-primary no-underline">
              Driver login
            </Link>
          )}
          {variant !== 'admin' && (
            <Link to="/admin/login" className="text-label-md text-on-surface-variant hover:text-primary no-underline">
              Admin login
            </Link>
          )}
          {variant !== 'maintenance' && (
            <Link to="/maintenance/login" className="text-label-md text-on-surface-variant hover:text-primary no-underline">
              Maintenance login
            </Link>
          )}
        </div>

        <p className="text-center mt-md">
          <Link to="/" className="text-label-md text-on-surface-variant hover:text-primary no-underline">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
