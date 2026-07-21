/**
 * Emergency SOS (PROJECT_SPEC.md sections 2 + 3). Fixed bottom-right, above
 * the mobile bottom nav (bottom-24) per the Agni design system reference —
 * a Firestore trigger (functions/src/index.ts) turns each alert into an
 * admin notification.
 */

import React, { useState } from 'react';
import IconSos from '~icons/material-symbols/sos';
import IconCheck from '~icons/material-symbols/check-circle';
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
    <button
      className={`fixed bottom-24 right-6 z-[90] w-16 h-16 rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-transform disabled:opacity-70
        ${sent ? 'bg-green-600 text-white' : 'bg-error text-on-error'}`}
      onClick={handlePress}
      disabled={sending}
      title="Emergency SOS"
    >
      {sent ? (
        <span className="flex flex-col items-center gap-0.5">
          <IconCheck className="w-6 h-6" />
          <span className="font-label-md text-[10px] font-bold leading-none">Sent</span>
        </span>
      ) : sending ? (
        <span className="font-label-md text-[11px] font-bold">…</span>
      ) : (
        <IconSos className="w-9 h-9" />
      )}
    </button>
  );
};
