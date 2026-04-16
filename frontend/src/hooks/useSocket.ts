import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { LocationUpdate, BusStatusChange } from '../types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

let sharedSocket: Socket | null = null;

function getSocket(token?: string | null): Socket {
  if (!sharedSocket || !sharedSocket.connected) {
    sharedSocket = io(BACKEND_URL, {
      auth: token ? { token } : {},
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
  }
  return sharedSocket;
}

interface UseSocketOptions {
  token?: string | null;
  onLocationUpdate?: (data: LocationUpdate) => void;
  onBusStatusChange?: (data: BusStatusChange) => void;
  onError?: (err: { message: string }) => void;
}

export function useSocket({ token, onLocationUpdate, onBusStatusChange, onError }: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket(token);
    socketRef.current = socket;

    if (onLocationUpdate) socket.on('location_update', onLocationUpdate);
    if (onBusStatusChange) socket.on('bus_status_change', onBusStatusChange);
    if (onError) socket.on('error', onError);

    return () => {
      if (onLocationUpdate) socket.off('location_update', onLocationUpdate);
      if (onBusStatusChange) socket.off('bus_status_change', onBusStatusChange);
      if (onError) socket.off('error', onError);
    };
  }, [token, onLocationUpdate, onBusStatusChange, onError]);

  const emit = useCallback((event: string, data: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const joinDriverRoom = useCallback((busId: string) => {
    socketRef.current?.emit('driver_joined', { busId });
  }, []);

  const watchBus = useCallback((busId: string) => {
    socketRef.current?.emit('student_watch_bus', { busId });
  }, []);

  const stopWatching = useCallback((busId: string) => {
    socketRef.current?.emit('student_stop_watching', { busId });
  }, []);

  const sendLocation = useCallback(
    (data: { busId: string; latitude: number; longitude: number; accuracy?: number; speed?: number | null }) => {
      socketRef.current?.emit('driver_location_update', data);
    },
    []
  );

  const startTrip = useCallback((busId: string) => {
    socketRef.current?.emit('trip_started', { busId });
  }, []);

  const stopTrip = useCallback((busId: string) => {
    socketRef.current?.emit('trip_stopped', { busId });
  }, []);

  return { emit, joinDriverRoom, watchBus, stopWatching, sendLocation, startTrip, stopTrip };
}
