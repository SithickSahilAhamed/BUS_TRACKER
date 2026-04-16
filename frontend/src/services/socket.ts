import { io, Socket } from 'socket.io-client';
import { LocationUpdate, BusStatusChange, Bus, Trip } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Function[]> = new Map();

  private readonly SERVER_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
  private readonly RECONNECT_DELAY = 3000;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isReconnecting = false;

  // ─────────────────────────────────────────────────────────────────────────
  // CONNECTION MANAGEMENT - ✅ FIXED: Better error handling and logging
  // ─────────────────────────────────────────────────────────────────────────

  connect(token?: string | null): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.SERVER_URL, {
          auth: token ? { token } : undefined,
          reconnection: true,
          reconnectionDelay: this.RECONNECT_DELAY,
          reconnectionAttempts: this.maxReconnectAttempts,
          transports: ['websocket', 'polling'],
          upgrade: true,
        });

        this.socket.on('connect', () => {
          console.log('✅ Socket connected:', this.socket?.id);
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.emit('connection-status', { isConnected: true });
          resolve();
        });

        this.socket.on('disconnect', (reason: any) => {
          console.warn('⚠️ Socket disconnected:', reason);
          this.emit('connection-status', { isConnected: false });
          
          // Auto-reconnect with exponential backoff
          if (!this.isReconnecting && reason !== 'io client namespace disconnect' && reason !== 'nsp namespace disconnect') {
            this.scheduleReconnect();
          }
        });

        this.socket.on('connect_error', (error: any) => {
          console.error('❌ Socket connection error:', error);
          this.handleReconnect();
          if (this.reconnectAttempts === 1) {
            reject(error);
          }
        });

        this.socket.on('error', (error: any) => {
          console.error('❌ Socket error:', error);
        });

        // Setup all listeners
        this.setupListeners();
      } catch (error) {
        console.error('❌ Socket initialization error:', error);
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    }
  }

  private scheduleReconnect(): void {
    if (this.isReconnecting || !this.socket) return;
    
    this.isReconnecting = true;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        console.log(`🔄 Attempting manual reconnect...`);
        this.socket.connect();
      }
      this.isReconnecting = false;
    }, delay);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Send any arbitrary socket event — used by driver panel for location updates */
  rawEmit(event: string, data: unknown): void {
    if (!this.socket?.connected) {
      console.warn('⚠️ Socket not connected, dropping emit:', event);
      return;
    }
    this.socket.emit(event, data);
  }

  /** Expose the raw socket for pages that need direct listener access */
  get rawSocket() {
    return this.socket;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EVENT LISTENERS - ✅ FIXED: Consistent event naming (kebab-case)
  // ─────────────────────────────────────────────────────────────────────────

  private setupListeners(): void {
    if (!this.socket) return;

    // ✅ Location updates (from backend)
    this.socket.on('location-update', (data: LocationUpdate) => {
      this.emit('location-update', data);
    });

    // ✅ Bus status changes
    this.socket.on('bus-status-change', (data: BusStatusChange) => {
      this.emit('bus-status-change', data);
    });

    // ✅ Bus data updates
    this.socket.on('bus-data', (data: Bus) => {
      this.emit('bus-data', data);
    });

    // ✅ Trip events
    this.socket.on('trip-started', (data: Trip) => {
      this.emit('trip-started', data);
    });

    this.socket.on('trip-ended', (data: Trip) => {
      this.emit('trip-ended', data);
    });

    // ✅ Error handling
    this.socket.on('error', (data: any) => {
      console.error('❌ Server error:', data);
      this.emit('error', data);
    });

    // ✅ Auth errors
    this.socket.on('auth-error', (error: any) => {
      console.error('❌ Authentication error:', error);
      this.emit('auth-error', error);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUS ROOM MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  joinBusRoom(busId: string): void {
    if (!this.socket) {
      console.warn('⚠️ Socket not connected, cannot join room');
      return;
    }
    this.socket.emit('student-watch-bus', { busId });
    console.log(`✅ Watching bus room: ${busId}`);
  }

  leaveBusRoom(busId: string): void {
    if (!this.socket) return;
    this.socket.emit('student-stop-watching', { busId });
    console.log(`✅ Stopped watching bus: ${busId}`);
  }

  joinAdminRoom(): void {
    if (!this.socket) {
      console.warn('⚠️ Socket not connected, cannot join admin room');
      return;
    }
    this.socket.emit('admin-join');
    console.log(`✅ Joined admin room`);
  }

  leaveAdminRoom(): void {
    if (!this.socket) return;
    this.socket.emit('admin-leave');
    console.log(`✅ Left admin room`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DRIVER EVENTS - ✅ FIXED: Consistent naming
  // ─────────────────────────────────────────────────────────────────────────

  startTrip(busId: string, routeId?: string, token?: string): void {
    if (!this.socket) return;
    this.socket.emit('trip-started', { busId, routeId, token });
  }

  stopTrip(busId: string, token?: string): void {
    if (!this.socket) return;
    this.socket.emit('trip-stopped', { busId, token });
  }

  updateLocation(data: any): void {
    if (!this.socket) {
      console.warn('⚠️ Socket not connected, cannot send location');
      return;
    }
    this.socket.emit('driver-location-update', data);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOM EVENT MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  off(event: string, callback?: Function): void {
    if (!callback) {
      this.listeners.delete(event);
      return;
    }

    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(data));
    }
  }
}

export default new SocketService();
