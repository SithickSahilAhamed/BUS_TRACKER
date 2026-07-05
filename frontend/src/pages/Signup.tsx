import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

const COLLEGE_EMAIL_DOMAIN = '@act.edu.in';

const isCollegeEmail = (email: string): boolean =>
  email.trim().toLowerCase().endsWith(COLLEGE_EMAIL_DOMAIN);

const friendlyError = (code: string): string => {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password is too weak — use at least 6 characters.';
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/network-request-failed':
      return 'Network error — check your internet connection.';
    default:
      return 'Sign up failed. Please try again.';
  }
};

const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'student' | 'professor'>('student');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already signed in with a profile → straight to the map
  useEffect(() => {
    if (!loading && profile) navigate('/map', { replace: true });
  }, [loading, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isCollegeEmail(email)) {
      setError(`Use your college email address (ending in ${COLLEGE_EMAIL_DOMAIN}).`);
      return;
    }
    setSubmitting(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // Field set must exactly match the signup allowlist in firestore.rules
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        active: true,
        createdAt: serverTimestamp(),
      });
      // AuthContext picks up the profile; the effect above redirects to /map
    } catch (err: any) {
      setError(friendlyError(err?.code ?? ''));
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <h1 className="login-title">🚌 Create Account</h1>
        <p className="login-subtitle">For students and professors of Agni College</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full name</label>
            <input
              type="text"
              className="form-control"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">College email</label>
            <input
              type="email"
              className="form-control"
              placeholder="23it104@act.edu.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p style={{ fontSize: '.8rem', color: 'rgba(255,255,255,.5)', marginTop: '.35rem' }}>
              Must be your {COLLEGE_EMAIL_DOMAIN} address.
            </p>
          </div>
          <div className="form-group">
            <label className="form-label">Password (min 6 characters)</label>
            <input
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">I am a…</label>
            <div style={{ display: 'flex', gap: '.75rem' }}>
              <button
                type="button"
                className={`btn btn-block ${role === 'student' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRole('student')}
              >
                🎓 Student
              </button>
              <button
                type="button"
                className={`btn btn-block ${role === 'professor' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRole('professor')}
              >
                📚 Professor
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'rgba(255,255,255,.6)', fontSize: '.9rem' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#8ecdf7', fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignupPage;
