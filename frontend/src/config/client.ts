/**
 * Client Configuration
 * Environment-aware configuration for frontend
 */

interface IClientConfig {
  apiUrl: string;
  socketUrl: string;
  googleMapsApiKey: string;
}

class ClientConfig implements IClientConfig {
  apiUrl: string;
  socketUrl: string;
  googleMapsApiKey: string;

  constructor() {
    // Get API URL from environment or default
    this.apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    this.socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    this.googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

    // Validate configuration
    this.validate();
  }

  validate() {
    if (!this.apiUrl) {
      console.error('❌ VITE_API_URL environment variable not set');
    }
    if (!this.socketUrl) {
      console.error('❌ VITE_SOCKET_URL environment variable not set');
    }
    if (!this.googleMapsApiKey) {
      console.warn('⚠️  VITE_GOOGLE_MAPS_API_KEY not set - Google Maps may not load');
    }
  }

  // API endpoints
  getEndpoint(path: string): string {
    return `${this.apiUrl}${path}`;
  }

  // Socket.IO configuration
  getSocketConfig() {
    return {
      url: this.socketUrl,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    };
  }

  // Log configuration (for debugging)
  logConfig() {
    if (import.meta.env.DEV) {
      console.log('🔧 Client Configuration:', {
        environment: import.meta.env.MODE,
        apiUrl: this.apiUrl,
        socketUrl: this.socketUrl,
        googleMapsApiKey: this.googleMapsApiKey ? '✓' : '✗'
      });
    }
  }
}

export default new ClientConfig();
