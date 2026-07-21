import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Input, Button } from '../components/common';

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
    <div className="min-h-screen flex items-center justify-center bg-surface-container-low px-md py-2xl">
      <div className="w-full max-w-sm bg-surface-container-lowest rounded-xl border border-outline-variant p-xl" style={{ borderTop: '4px solid #4aa3df' }}>
        <h1 className="font-headline-md text-headline-md text-on-surface mb-xs">🚌 Create Account</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-lg">For students and professors of Agni College</p>

        {error && (
          <div className="mb-md p-sm rounded-lg bg-error-container text-on-error-container text-body-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Input
            label="Full name"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <div className="mb-md">
            <Input
              label="College email"
              type="email"
              placeholder="23it104@act.edu.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="text-label-md text-on-surface-variant">Must be your {COLLEGE_EMAIL_DOMAIN} address.</p>
          </div>
          <Input
            label="Password (min 6 characters)"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <div className="mb-md">
            <label className="block mb-xs font-label-md text-label-md text-on-surface-variant">I am a…</label>
            <div className="flex gap-sm">
              <Button
                type="button"
                fullWidth
                variant={role === 'student' ? 'primary' : 'secondary'}
                onClick={() => setRole('student')}
              >
                🎓 Student
              </Button>
              <Button
                type="button"
                fullWidth
                variant={role === 'professor' ? 'primary' : 'secondary'}
                onClick={() => setRole('professor')}
              >
                📚 Professor
              </Button>
            </div>
          </div>
          <Button type="submit" fullWidth size="lg" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create Account'}
          </Button>
        </form>

        <p className="text-center mt-lg text-body-md text-on-surface-variant">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-secondary no-underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignupPage;
