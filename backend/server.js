/**
 * ========================================
 * COLLEGE BUS TRACKING SYSTEM - BACKEND
 * Real-time GPS Tracking with Socket.IO
 * ========================================
 */

require('dotenv').config();

const express     = require('express');
const http        = require('http');
const socketIO    = require('socket.io');
const cors        = require('cors');
const path        = require('path');
require('dotenv').config();

// Import configurations and routes
const connectDB    = require('./config/db');
const apiRoutes    = require('./routes/api');
const verifyToken  = apiRoutes.verifyToken;   // ← driver auth
const errorHandler = require('./middleware/errorHandler');
const Bus          = require('./models/Bus');
const Location     = require('./models/Location');

// ========== CONFIGURATION ==========
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || 'localhost';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173';
const corsOrigins = CORS_ORIGIN.split(',').map(origin => origin.trim());

console.log(`🔧 Environment: ${NODE_ENV}`);
console.log(`📡 CORS allowed origins: ${corsOrigins.join(', ')}`);

// ========== DATABASE CONNECTION ==========
connectDB();

// ========== FIREBASE INITIALIZATION ==========
const admin = require('firebase-admin');
try {
  // Try to initialize Firebase if credentials are available
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      })
    });
    console.log('🔥 Firebase Admin initialized from env variables');
  } else if (require('fs').existsSync('./serviceAccountKey.json')) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('🔥 Firebase Admin initialized from serviceAccountKey.json');
  } else {
    console.warn('⚠️  Firebase Admin not initialized - set FIREBASE_* env vars or add serviceAccountKey.json');
  }
} catch (err) {
  console.warn('⚠️  Firebase Admin initialization skipped:', err.message);
}

// ========== EXPRESS APP INITIALIZATION ==========
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

// ========== MIDDLEWARE ==========
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Built-in JSON and URL-encoded parsers (Express 4.16+)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`${req.method} ${req.path}`);
  }
  next();
});

// Serve frontend static files
app.use(express.static('public'));

// ========== API ROUTES ==========
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'Server is running ✅',
    timestamp: new Date(),
    uptime: process.uptime(),
    environment: NODE_ENV,
  });
});

// ========== WEBSOCKET EVENTS ==========
// Give simulation endpoint access to io for emitting events
apiRoutes._io = io;

const activeSockets = new Map(); // Track active connections { busId -> Set(socketIds) }

// Validation helper for GPS coordinates
function isValidCoordinates(latitude, longitude) {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  
  // Check valid latitude range: -90 to 90
  if (isNaN(lat) || lat < -90 || lat > 90) return false;
  
  // Check valid longitude range: -180 to 180
  if (isNaN(lng) || lng < -180 || lng > 180) return false;
  
  return true;
}

io.on('connection', (socket) => {
  console.log('🟢 Client connected:', socket.id);

  /**
   * Driver joins with busId + auth token
   */
  socket.on('driver_joined', async (data) => {
    const { busId, token } = data;

    // ── AUTH CHECK ──
    const auth = verifyToken(token);
    if (!auth || auth.busId !== busId) {
      socket.emit('auth_error', { message: 'Authentication failed. Please log in again.' });
      console.warn(`🔒 Rejected unauthenticated driver for bus: ${busId}`);
      socket.disconnect();
      return;
    }

    console.log(`✅ Driver authenticated for bus ${busId}:`, socket.id);
    socket.join(`bus_${busId}`);
    socket.busId  = busId;
    socket.authed = true;

    // Track connection using Set instead of Array
    if (!activeSockets.has(busId)) activeSockets.set(busId, new Set());
    activeSockets.get(busId).add(socket.id);

    io.emit('bus-status-change', {
      busId,
      status: 'online',
      timestamp: new Date(),
      totalActiveBuses: activeSockets.size,
    });
    console.log(`📊 Active buses: ${activeSockets.size}`);
  });

  /**
   * Receive GPS location from authenticated driver
   */
  socket.on('driver_location_update', async (data) => {
    const { busId, latitude, longitude, accuracy, speed, token } = data;

    // ── AUTH CHECK ──
    if (!socket.authed) {
      const auth = verifyToken(token);
      if (!auth || auth.busId !== busId) {
        socket.emit('auth_error', { message: 'Session expired. Please log in again.' });
        return;
      }
      socket.authed = true;
    }

    // Validate data
    if (!busId) {
      socket.emit('error', { message: 'Bus ID is required' });
      return;
    }

    // Validate coordinates
    if (!isValidCoordinates(latitude, longitude)) {
      socket.emit('error', { 
        message: 'Invalid GPS coordinates. Lat: -90 to 90, Lng: -180 to 180' 
      });
      return;
    }

    // Rate limiting: prevent too frequent updates (minimum 1 second between updates)
    const now = Date.now();
    if (socket.lastLocationUpdate && (now - socket.lastLocationUpdate) < 1000) {
      console.warn(`⏱️  Rate limited: Bus ${busId} updating too frequently`);
      return;
    }
    socket.lastLocationUpdate = now;

    // Update bus in database
    try {
      const bus = await Bus.findOne({ busId });
      if (bus) {
        bus.lastLocation = {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          timestamp: new Date(),
        };
        bus.isActive = true;
        await bus.save();

        // Store location history (optional: comment out if too slow)
        try {
          await Location.create({
            busId,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            accuracy: accuracy ? parseFloat(accuracy) : null,
            speed: speed ? parseFloat(speed) : null,
            timestamp: new Date(),
          });
        } catch (historyErr) {
          console.warn('Location history save failed (non-critical):', historyErr.message);
        }
      }
    } catch (error) {
      console.error('Error saving location:', error);
      socket.emit('error', { message: 'Failed to save location' });
      return;
    }

    // Broadcast to all students monitoring this bus
    // Using kebab-case to match frontend socket service listeners
    io.to(`bus_${busId}`).emit('location-update', {
      busId,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      accuracy: accuracy ? parseFloat(accuracy) : null,
      speed: speed ? parseFloat(speed) : null,
      timestamp: new Date(),
    });

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`📍 Location update - Bus: ${busId}, Lat: ${latitude}, Lng: ${longitude}`);
    }
  });

  /**
   * Student subscribes to bus updates (support both naming conventions)
   */
  const handleStudentWatchBus = async (data) => {
    const { busId } = data;
    console.log(`Student ${socket.id} watching bus: ${busId}`);

    socket.join(`bus_${busId}`);
    socket.watchingBusId = busId;

    // Send current location if available
    try {
      const bus = await Bus.findOne({ busId });
      if (bus && bus.lastLocation) {
        socket.emit('location-update', {
          busId: bus.busId,
          latitude: bus.lastLocation.latitude,
          longitude: bus.lastLocation.longitude,
          timestamp: bus.lastLocation.timestamp,
        });
      }
    } catch (error) {
      console.error('Error fetching bus location:', error);
    }
  };

  socket.on('student-watch-bus', handleStudentWatchBus);
  socket.on('student_watch_bus', handleStudentWatchBus);

  /**
   * Student stops watching bus (support both naming conventions)
   */
  const handleStudentStopWatching = (data) => {
    const { busId } = data;
    console.log(`Student ${socket.id} stopped watching bus: ${busId}`);
    socket.leave(`bus_${busId}`);
  };
  socket.on('student-stop-watching', handleStudentStopWatching);
  socket.on('student_stop_watching', handleStudentStopWatching);

  /**
   * Trip started event
   */
  socket.on('trip_started', (data) => {
    const { busId } = data;
    io.emit('bus-status-change', {
      busId,
      status: 'online',
      timestamp: new Date(),
    });
    console.log(`🚌 Trip started for bus: ${busId}`);
  });

  /**
   * Trip stopped event
   */
  socket.on('trip_stopped', (data) => {
    const { busId } = data;

    // Remove from active sockets
    if (activeSockets.has(busId)) {
      activeSockets.delete(busId);
    }

    io.emit('bus-status-change', {
      busId,
      status: 'offline',
      timestamp: new Date(),
    });
    console.log(`🛑 Trip stopped for bus: ${busId}`);
  });

  /**
   * Handle disconnection - CRITICAL for memory leak prevention
   */
  socket.on('disconnect', async () => {
    console.log('🔴 Client disconnected:', socket.id);

    // If driver disconnected, mark bus as offline
    if (socket.busId) {
      const busId = socket.busId;
      const busConnections = activeSockets.get(busId);

      if (busConnections) {
        busConnections.delete(socket.id);

        // If no more connections, bus is offline
        if (busConnections.size === 0) {
          activeSockets.delete(busId);
          try {
            const bus = await Bus.findOne({ busId });
            if (bus) {
              bus.isActive = false;
              await bus.save();
            }
          } catch (error) {
            console.error('Error updating bus status on disconnect:', error);
          }

          io.emit('bus-status-change', {
            busId,
            status: 'offline',
            timestamp: new Date(),
          });
          console.log(`⚫ Bus ${busId} marked offline`);
        }
      }
    }

    // Clean up any other references
    delete socket.lastLocationUpdate;
    delete socket.watchingBusId;
  });

  /**
   * Error handling
   */
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// ========== ERROR HANDLING MIDDLEWARE ==========
app.use(errorHandler);

// ========== 404 HANDLER ==========
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// ========== SERVER START ==========
// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('🛑 Server closed');
    process.exit(0);
  });
});

server.listen(PORT, HOST, () => {
  const baseUrl = NODE_ENV === 'development' 
    ? `http://${HOST}:${PORT}` 
    : `https://yourdomain.com:${PORT}`;
  
  console.log('\n✅ Bus Tracking Server Started!');
  console.log(`📡 Running on: ${baseUrl}`);
  console.log(`🌍 WebSocket ready at: ${baseUrl}/socket.io`);
  console.log(`🏥 Health check: ${baseUrl}/health`);
  console.log(`🔧 Environment: ${NODE_ENV}`);
  console.log(`📊 Connected APIs: ${corsOrigins.join(', ')}`);
  console.log('\n');
});

// Graceful error handling
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Try a different port.`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', err);
  }
});

module.exports = { server, app, io };
