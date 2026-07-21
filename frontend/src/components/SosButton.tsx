/**
 * Emergency SOS (PROJECT_SPEC.md sections 2 + 3). Fixed bottom-left so it
 * never collides with the chat FAB (bottom-right). A Firestore trigger
 * (functions/src/index.ts) turns each alert into an admin notification.
 */

import React, { useState } from 'react';
import { submitSosAlert } from '../services/firestore';
import type { LatLng } from '../types';

interface SosButtonProps {
  userId: string;
  userName: string;
  role: 'student' | 'professor' | 'driver';
  busId: string | null;
}

const getLocation = (): Promise<LatLng | null> =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 30000 }
    );
  });

export const SosButton: React.FC<SosButtonProps> = ({ userId, userName, role, busId }) => {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handlePress = async () => {
    if (!window.confirm('Send an emergency SOS alert to the admin? Only use this for a real emergency.')) return;
    setSending(true);
    try {
      const location = await getLocation();
      await submitSosAlert({ userId, userName, role, busId, location });
      setSent(true);
      setTimeout(() => setSent(false), 8000);
    } catch {
      window.alert('Could not send the SOS alert — check your connection and try again, or contact the transport office directly.');
    } finally {
      setSending(false);
    }
  };

  return (
    <button className={`sos-fab ${sent ? 'sos-fab-sent' : ''}`} onClick={handlePress} disabled={sending} title="Emergency SOS">
      {sent ? '✓ Admin notified' : sending ? 'Sending…' : '🆘 SOS'}
    </button>
  );
};
