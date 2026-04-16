// ============================================================================
// USER & AUTHENTICATION TYPES
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'driver' | 'admin';
  phoneNumber?: string;
  profileImage?: string;
  firebaseUid?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// BUS & DRIVER TYPES
// ============================================================================

export interface Bus {
  id: string;
  busNumber: string;
  capacity: number;
  model?: string;
  registrationPlate?: string;
  currentRoute?: string;
  assignedDriver?: string;
  status: 'active' | 'inactive' | 'maintenance';
  lastLocation?: BusLocation;
  createdAt?: string;
  updatedAt?: string;
  
  // Legacy fields for backward compatibility
  busId?: string; // Alias for id
  busName?: string; // Alias for busNumber
  routeName?: string; // Alias for currentRoute
  driverName?: string; // Alias for assignedDriver
  isActive?: boolean; // Alias for status === 'active'
}

export interface Driver {
  id: string;
  userId: string;
  name: string;
  phoneNumber: string;
  licenseNumber: string;
  assignedBus?: string;
  status: 'active' | 'inactive' | 'on-leave';
  rating?: number;
  profileImage?: string;
  createdAt?: string;
}

// ============================================================================
// LOCATION & COORDINATES TYPES
// ============================================================================

export interface BusLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp: string | Date;
}

export interface LocationUpdate {
  busId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp: string | Date;
}

export interface BusTracking {
  busId: string;
  busNumber: string;
  currentLocation: BusLocation;
  route: Route;
  estimatedArrival?: string;
  nextStop?: Waypoint;
  occupancy?: number;
  driver?: Driver;
}

// ============================================================================
// ROUTE & WAYPOINTS TYPES
// ============================================================================

export interface Route {
  id: string;
  name: string;
  origin: string;
  destination: string;
  waypoints: Waypoint[];
  estimatedDuration: number; // in minutes
  distance: number; // in km
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Waypoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  stopNumber: number;
  stopType: 'pickup' | 'dropoff' | 'intermediate';
}

// ============================================================================
// TRIP TYPES
// ============================================================================

export interface Trip {
  id: string;
  busId: string;
  routeId: string;
  driverId: string;
  startTime: string;
  endTime?: string;
  status: 'active' | 'completed' | 'cancelled';
  distance?: number;
  duration?: number;
  studentsCount?: number;
}

// ============================================================================
// STATUS & EVENT TYPES
// ============================================================================

export interface BusStatusChange {
  busId: string;
  status: 'online' | 'offline';
  timestamp: string | Date;
}

export interface GPSStatus {
  isEnabled: boolean;
  accuracy: number | null;
  lastUpdate: string | Date;
}

export interface ConnectionStatus {
  isConnected: boolean;
  lastUpdate: string | Date;
  connectionType: 'websocket' | 'http' | 'offline';
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
}

export interface ModalState {
  isOpen: boolean;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
}

// ============================================================================
// FILTER & SEARCH TYPES
// ============================================================================

export interface BusFilter {
  status?: Bus['status'];
  route?: string;
  searchTerm?: string;
}

export interface SelectOption {
  value: string | number;
  label: string;
  icon?: React.ReactNode;
}
