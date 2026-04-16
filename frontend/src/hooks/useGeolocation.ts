import { useState, useEffect } from 'react';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speed: number | null;
  error: string | null;
  watching: boolean;
}

export function useGeolocation(enabled: boolean) {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    speed: null,
    error: null,
    watching: false,
  });

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'Geolocation not supported by your browser' }));
      return;
    }

    setState((s) => ({ ...s, watching: true, error: null }));

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          error: null,
          watching: true,
        });
      },
      (err) => {
        let message = 'GPS error';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            message = 'Location permission denied. Please enable in browser settings.';
            break;
          case err.POSITION_UNAVAILABLE:
            message = 'GPS position unavailable.';
            break;
          case err.TIMEOUT:
            message = 'GPS request timed out.';
            break;
        }
        setState((s) => ({ ...s, error: message, watching: false }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setState((s) => ({ ...s, watching: false }));
    };
  }, [enabled]);

  return state;
}
