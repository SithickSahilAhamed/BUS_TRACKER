import { useState, useEffect, useCallback, useRef } from 'react';
import SocketService from '../services/socket';
import { BusLocation, LocationUpdate, Bus } from '../types';

/**
 * Hook for managing real-time location updates
 */
export const useLocationTracking = (busId: string | null | undefined) => {
  const [location, setLocation] = useState<BusLocation | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!busId) {
      // Clear watch when busId is cleared
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
      return;
    }

    if ('geolocation' in navigator) {
      try {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const newLocation: BusLocation = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              speed: position.coords.speed,
              timestamp: new Date().toISOString(),
            };
            setLocation(newLocation);
            setIsTracking(true);

            // Emit via socket
            SocketService.updateLocation({
              busId,
              ...newLocation,
            });
          },
          (error) => {
            console.error('Geolocation error:', error);
            setIsTracking(false);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        );
      } catch (error) {
        console.error('Failed to start geolocation watch:', error);
        setIsTracking(false);
      }
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [busId]);

  return { location, isTracking };
};

/**
 * Hook for listening to socket events
 */
export const useSocketListener = (event: string, callback: (data: any) => void) => {
  useEffect(() => {
    SocketService.on(event, callback);

    return () => {
      SocketService.off(event, callback);
    };
  }, [event, callback]);
};

/**
 * Hook for fetching buses with real-time updates
 */
export const useBuses = () => {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  useEffect(() => {
    const handleLocationUpdate = (data: LocationUpdate) => {
      setBuses((prevBuses) =>
        prevBuses.map((bus) =>
          bus.id === data.busId
            ? {
                ...bus,
                lastLocation: {
                  latitude: data.latitude,
                  longitude: data.longitude,
                  accuracy: data.accuracy,
                  speed: data.speed,
                  timestamp: data.timestamp,
                },
              }
            : bus
        )
      );
    };

    const handleBusData = (data: Bus) => {
      setBuses((prevBuses) => {
        const exists = prevBuses.find((b) => b.id === data.id);
        if (exists) {
          return prevBuses.map((b) => (b.id === data.id ? data : b));
        }
        return [...prevBuses, data];
      });
    };

    SocketService.on('location-update', handleLocationUpdate);
    SocketService.on('bus-data', handleBusData);

    return () => {
      SocketService.off('location-update', handleLocationUpdate);
      SocketService.off('bus-data', handleBusData);
    };
  }, []);

  return { buses, isLoading, error };
};

/**
 * Hook for debounced value
 */
export const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Hook for managing async operations with loading and error states
 */
export const useAsync = <T, E = string>(
  asyncFunction: () => Promise<T>,
  immediate = true
) => {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<E | null>(null);

  const execute = useCallback(async () => {
    setStatus('pending');
    setData(null);
    setError(null);

    try {
      const response = await asyncFunction();
      setData(response);
      setStatus('success');
    } catch (error: any) {
      setError(error.message);
      setStatus('error');
    }
  }, [asyncFunction]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { status, data, error, execute };
};

/**
 * Hook for managing timeout with cleanup
 */
export const useTimeout = (callback: () => void, delay: number | null) => {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const id = setTimeout(() => savedCallback.current(), delay);
    return () => clearTimeout(id);
  }, [delay]);
};

/**
 * Hook for managing auto-retry logic
 */
export const useRetry = (
  fn: () => Promise<any>,
  maxRetries = 3,
  delay = 1000
) => {
  const [attempt, setAttempt] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const retry = useCallback(async () => {
    let lastError: any;

    for (let i = 0; i < maxRetries; i++) {
      setAttempt(i + 1);
      setIsRetrying(true);

      try {
        const result = await fn();
        setIsRetrying(false);
        setAttempt(0);
        return result;
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }

    setIsRetrying(false);
    throw lastError;
  }, [fn, maxRetries, delay]);

  return { retry, attempt, isRetrying };
};
