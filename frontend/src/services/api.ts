import { ApiResponse, Bus, Driver, Route, Trip, User } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

class ApiService {
  private static getHeaders(): HeadersInit {
    const token = localStorage.getItem('authToken');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  private static async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API Error: ${response.statusText}`);
    }
    return response.json();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  static async verifyToken(token: string): Promise<ApiResponse<User>> {
    const response = await fetch(`${API_BASE_URL}/auth/verify-token`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ token }),
    });
    return this.handleResponse<ApiResponse<User>>(response);
  }

  static async getMe(): Promise<ApiResponse<User>> {
    const response = await fetch(`${API_BASE_URL}/user/sync`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return this.handleResponse<ApiResponse<User>>(response);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUS ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  static async getBuses(): Promise<ApiResponse<Bus[]>> {
    const response = await fetch(`${API_BASE_URL}/buses`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return this.handleResponse<ApiResponse<Bus[]>>(response);
  }

  static async getBus(busId: string): Promise<ApiResponse<Bus>> {
    const response = await fetch(`${API_BASE_URL}/buses/${busId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return this.handleResponse<ApiResponse<Bus>>(response);
  }

  static async createBus(data: Partial<Bus>): Promise<ApiResponse<Bus>> {
    const response = await fetch(`${API_BASE_URL}/buses`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<ApiResponse<Bus>>(response);
  }

  static async updateBus(busId: string, data: Partial<Bus>): Promise<ApiResponse<Bus>> {
    const response = await fetch(`${API_BASE_URL}/buses/${busId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<ApiResponse<Bus>>(response);
  }

  static async deleteBus(busId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE_URL}/buses/${busId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return this.handleResponse<ApiResponse<void>>(response);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOCATION ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  static async postLocation(latitude: number, longitude: number, busId?: string) {
    const response = await fetch(`${API_BASE_URL}/location/post-location`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ latitude, longitude, busId }),
    });
    return this.handleResponse(response);
  }

  static async getLocations(busId: string, limit: number = 100) {
    const response = await fetch(`${API_BASE_URL}/location/get-locations?busId=${busId}&limit=${limit}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  static async getLocationHistory(busId: string, startDate?: string, endDate?: string) {
    const params = new URLSearchParams({ busId });
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await fetch(`${API_BASE_URL}/location/location-history?${params}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRIP ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  static async startTrip(busId: string, routeId: string) {
    const response = await fetch(`${API_BASE_URL}/trip/start-trip`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ busId, routeId }),
    });
    return this.handleResponse(response);
  }

  static async stopTrip(tripId: string) {
    const response = await fetch(`${API_BASE_URL}/trip/stop-trip`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ tripId }),
    });
    return this.handleResponse(response);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DRIVER ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  static async getDrivers(): Promise<ApiResponse<Driver[]>> {
    const response = await fetch(`${API_BASE_URL}/drivers`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return this.handleResponse<ApiResponse<Driver[]>>(response);
  }

  static async createDriver(data: Partial<Driver>): Promise<ApiResponse<Driver>> {
    const response = await fetch(`${API_BASE_URL}/drivers`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<ApiResponse<Driver>>(response);
  }

  static async updateDriver(driverId: string, data: Partial<Driver>): Promise<ApiResponse<Driver>> {
    const response = await fetch(`${API_BASE_URL}/drivers/${driverId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<ApiResponse<Driver>>(response);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ROUTE ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  static async getRoutes(): Promise<ApiResponse<Route[]>> {
    const response = await fetch(`${API_BASE_URL}/routes`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return this.handleResponse<ApiResponse<Route[]>>(response);
  }

  static async getRoute(routeId: string): Promise<ApiResponse<Route>> {
    const response = await fetch(`${API_BASE_URL}/routes/${routeId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    return this.handleResponse<ApiResponse<Route>>(response);
  }

  static async createRoute(data: Partial<Route>): Promise<ApiResponse<Route>> {
    const response = await fetch(`${API_BASE_URL}/routes`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<ApiResponse<Route>>(response);
  }

  static async updateRoute(routeId: string, data: Partial<Route>): Promise<ApiResponse<Route>> {
    const response = await fetch(`${API_BASE_URL}/routes/${routeId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<ApiResponse<Route>>(response);
  }

  static async deleteRoute(routeId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE_URL}/routes/${routeId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return this.handleResponse<ApiResponse<void>>(response);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SEED DATA (Development)
  // ─────────────────────────────────────────────────────────────────────────

  static async seedData() {
    const response = await fetch(`${API_BASE_URL}/seed`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }
}

export default ApiService;
