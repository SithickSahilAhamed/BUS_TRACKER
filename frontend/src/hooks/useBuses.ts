import { useEffect, useRef, useState } from 'react';
import { subscribeToBuses } from '../services/firestore';
import type { Bus } from '../types';

const HIDDEN_DETACH_MS = 60_000;

/**
 * Live list of all buses. Detaches the Firestore listener when the tab has
 * been hidden for a minute (an abandoned open tab would otherwise keep
 * consuming a read for every GPS update of every bus) and reattaches the
 * moment the tab becomes visible again.
 */
export function useBuses() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unsubRef = useRef<(() => void) | null>(null);
  const hiddenTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const attach = () => {
      if (unsubRef.current) return;
      unsubRef.current = subscribeToBuses(
        (b) => {
          setBuses(b);
          setLoading(false);
          setError(null);
        },
        (e) => {
          console.error('Bus subscription failed:', e);
          setError('Could not load live bus data.');
          setLoading(false);
        }
      );
    };

    const detach = () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenTimerRef.current = window.setTimeout(detach, HIDDEN_DETACH_MS);
      } else {
        if (hiddenTimerRef.current) {
          clearTimeout(hiddenTimerRef.current);
          hiddenTimerRef.current = null;
        }
        attach();
      }
    };

    attach();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (hiddenTimerRef.current) clearTimeout(hiddenTimerRef.current);
      detach();
    };
  }, []);

  return { buses, loading, error };
}
