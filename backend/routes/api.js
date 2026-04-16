/**
 * API Routes for Bus Tracking System
 * Handles location updates, bus management, and data retrieval
 */

const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const Bus      = require('../models/Bus');
const Location = require('../models/Location');
const User     = require('../models/User');
const admin    = require('firebase-admin');

// ──────────────────────────────────────────────
//  CONFIGURATION
// ──────────────────────────────────────────────
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'bus-tracker-dev-secret-2024-change-in-production';
const PIN_SALT = process.env.PIN_SALT || 'bus-pin-salt-2024-change-in-production';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Rate limiting simple implementation (in-memory)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }

  const counts = requestCounts.get(ip);
  const recentRequests = counts.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= RATE_LIMIT_MAX) {
    return false;
  }

  recentRequests.push(now);
  requestCounts.set(ip, recentRequests);
  return true;
}

// ──────────────────────────────────────────────
//  FIREBASE AUTHENTICATION USER SYNC
// ──────────────────────────────────────────────
router.post('/user/sync', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Firebase token required' 
      });
    }

    // Check if Firebase is initialized
    if (!admin.apps.length) {
      return res.status(503).json({ 
        success: false, 
        message: 'Firebase not configured on server' 
      });
    }

    // Verify token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(token);
    const { uid, email, name, picture } = decodedToken;

    // Upsert User in MongoDB
    let user = await User.findOne({ uid });
    if (!user) {
      user = new User({ uid, email, displayName: name, photoURL: picture });
    } else {
      user.lastLogin = Date.now();
      user.displayName = name || user.displayName;
      user.photoURL = picture || user.photoURL;
    }
    await user.save();

    res.status(200).json({ 
      success: true, 
      message: 'User synced successfully', 
      user 
    });
  } catch (error) {
    console.error('Firebase Auth Sync Error:', error.message);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid Firebase token',
      ...(LOG_LEVEL === 'debug' && { error: error.message })
    });
  }
});

// ──────────────────────────────────────────────
//  AUTH HELPERS
// ──────────────────────────────────────────────
function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin) + PIN_SALT).digest('hex');
}

function createToken(busId) {
  const ts = Date.now().toString();
  const payload = `${busId}:${ts}`;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    const secondLastColon = decoded.lastIndexOf(':', lastColon - 1);
    const payload = decoded.substring(0, lastColon);
    const sig = decoded.substring(lastColon + 1);
    const busId = decoded.substring(0, secondLastColon);
    const ts = parseInt(decoded.substring(secondLastColon + 1, lastColon));

    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    if (sig !== expected) return null;
    if (Date.now() - ts > TOKEN_TTL_MS) return null;
    return { busId };
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
//  ADMIN AUTHENTICATION ENDPOINT
// ──────────────────────────────────────────────

/**
 * POST /api/admin/login
 * Admin authenticates with credentials
 * Returns a token for admin dashboard access
 * 
 * For development: Use any credentials (return token if not empty)
 * For production: Implement proper admin database/credentials
 */
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ 
        success: false, 
        message: 'Too many login attempts. Try again in 1 minute.' 
      });
    }

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    // Development: Simple credential check (CHANGE FOR PRODUCTION)
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bustrack.com';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const token = createToken(email);
      
      if (LOG_LEVEL === 'debug') {
        console.log(`✅ Admin logged in - Email: ${email}`);
      }

      return res.status(200).json({
        success: true,
        message: 'Admin login successful',
        token,
        email,
        expiresIn: TOKEN_TTL_MS,
      });
    } else {
      // Log failed attempt
      if (LOG_LEVEL === 'debug') {
        console.warn(`❌ Failed admin login attempt - Email: ${email}`);
      }

      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }
  } catch (error) {
    console.error('Admin login error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login',
      ...(LOG_LEVEL === 'debug' && { error: error.message })
    });
  }
});

// ──────────────────────────────────────────────
//  DRIVER AUTHENTICATION ENDPOINTS
// ──────────────────────────────────────────────

/**
 * POST /api/driver/login
 * Driver authenticates with Bus ID + PIN
 * Returns a 12-hour auth token
 */
router.post('/driver/login', async (req, res) => {
  try {
    // Simple rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ 
        success: false, 
        message: 'Too many login attempts. Try again in 1 minute.' 
      });
    }

    const { busId, pin } = req.body;

    // Validate input
    if (!busId || typeof busId !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid Bus ID is required' 
      });
    }

    if (!pin) {
      return res.status(400).json({ 
        success: false, 
        message: 'PIN is required' 
      });
    }

    const bus = await Bus.findOne({ busId });
    if (!bus) {
      return res.status(404).json({ 
        success: false, 
        message: 'Bus ID not found. Contact administrator.' 
      });
    }

    const hashedPin = hashPin(pin);
    if (hashedPin !== bus.driverPin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Incorrect PIN. Try again.' 
      });
    }

    const token = createToken(busId);

    if (LOG_LEVEL === 'debug') {
      console.log(`✅ Driver logged in - Bus: ${busId}`);
    }

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      busId,
      busName: bus.busName,
      routeName: bus.routeName,
      driverName: bus.driverName,
      expiresIn: TOKEN_TTL_MS,
    });
  } catch (error) {
    console.error('Driver login error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login',
      ...(LOG_LEVEL === 'debug' && { error: error.message })
    });
  }
});

/**
 * POST /api/driver/verify-token
 * Verify if an auth token is valid (used by driver page on load)
 */
router.post('/driver/verify-token', (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ 
      success: false, 
      message: 'No token provided' 
    });
  }

  const result = verifyToken(token);
  if (!result) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token expired or invalid' 
    });
  }

  res.status(200).json({ 
    success: true, 
    busId: result.busId 
  });
});

/**
 * PUT /api/bus/:busId/set-pin
 * Admin endpoint: Set/change a driver's PIN
 */
router.put('/bus/:busId/set-pin', async (req, res) => {
  try {
    const { busId } = req.params;
    const { newPin } = req.body;

    if (!newPin || String(newPin).length < 4) {
      return res.status(400).json({ 
        success: false, 
        message: 'PIN must be at least 4 digits' 
      });
    }

    const bus = await Bus.findOne({ busId });
    if (!bus) {
      return res.status(404).json({ 
        success: false, 
        message: 'Bus not found' 
      });
    }

    bus.driverPin = hashPin(newPin);
    await bus.save();

    res.status(200).json({ 
      success: true, 
      message: `PIN updated for Bus ${busId}` 
    });
  } catch (error) {
    console.error('Set PIN error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * POST /api/location
 * Receive GPS location update from driver
 * Body: { busId, latitude, longitude, accuracy, speed }
 */
router.post('/location', async (req, res) => {

  try {
    const { busId, latitude, longitude, accuracy, speed } = req.body;

    // Validation
    if (!busId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: busId, latitude, longitude',
      });
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates',
      });
    }

    // Find or create bus
    let bus = await Bus.findOne({ busId });
    if (!bus) {
      bus = new Bus({
        busId,
        lastLocation: {
          latitude,
          longitude,
          timestamp: new Date(),
        },
        isActive: true,
      });
    } else {
      // Update last location
      bus.lastLocation = {
        latitude,
        longitude,
        timestamp: new Date(),
      };
      bus.isActive = true;
    }

    await bus.save();

    // Save location history
    const location = new Location({
      busId,
      latitude,
      longitude,
      accuracy,
      speed,
      timestamp: new Date(),
    });

    await location.save();

    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      data: {
        busId,
        latitude,
        longitude,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

/**
 * GET /api/location/:busId
 * Get latest location of a specific bus
 */
router.get('/location/:busId', async (req, res) => {
  try {
    const { busId } = req.params;

    const bus = await Bus.findOne({ busId });

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'Bus not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        busId: bus.busId,
        busName: bus.busName,
        routeName: bus.routeName,
        isActive: bus.isActive,
        lastLocation: bus.lastLocation,
        updatedAt: bus.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching location:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

/**
 * GET /api/buses
 * Get all active buses
 */
router.get('/buses', async (req, res) => {
  try {
    const buses = await Bus.find({});

    res.status(200).json({
      success: true,
      data: buses.map((bus) => ({
        busId: bus.busId,
        busName: bus.busName,
        routeName: bus.routeName,
        driverName: bus.driverName,
        isActive: bus.isActive,
        lastLocation: bus.lastLocation,
      })),
    });
  } catch (error) {
    console.error('Error fetching buses:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

/**
 * POST /api/bus/create
 * Create a new bus (Admin only)
 * Requires Bearer token in Authorization header
 */
router.post('/bus/create', async (req, res) => {
  try {
    // Verify admin authentication
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as admin.',
      });
    }

    const auth = verifyToken(token);
    if (!auth) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    const { busId, busName, routeName, driverName } = req.body;

    if (!busId || typeof busId !== 'string' || busId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid busId (string) is required',
      });
    }

    // Check if bus already exists
    const existingBus = await Bus.findOne({ busId: busId.trim() });
    if (existingBus) {
      return res.status(400).json({
        success: false,
        message: 'Bus with this ID already exists',
      });
    }

    const newBus = new Bus({
      busId: busId.trim(),
      busName: busName || `Bus ${busId}`,
      routeName: routeName || 'Unknown Route',
      driverName: driverName || 'Unknown Driver',
      driverPin: hashPin('1234'), // Default PIN
    });

    await newBus.save();

    console.log(`✅ Bus created: ${busId}`);
    res.status(201).json({
      success: true,
      message: 'Bus created successfully',
      data: newBus,
    });
  } catch (error) {
    console.error('Error creating bus:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

/**
 * POST /api/bus/:busId/start-trip
 * Start tracking for a bus
 */
router.post('/bus/:busId/start-trip', async (req, res) => {
  try {
    const { busId } = req.params;

    let bus = await Bus.findOne({ busId });

    if (!bus) {
      bus = new Bus({
        busId,
        isActive: true,
      });
    } else {
      bus.isActive = true;
    }

    await bus.save();

    res.status(200).json({
      success: true,
      message: 'Trip started',
      data: bus,
    });
  } catch (error) {
    console.error('Error starting trip:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

/**
 * POST /api/bus/:busId/stop-trip
 * Stop tracking for a bus
 */
router.post('/bus/:busId/stop-trip', async (req, res) => {
  try {
    const { busId } = req.params;

    const bus = await Bus.findOne({ busId });

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'Bus not found',
      });
    }

    bus.isActive = false;
    await bus.save();

    res.status(200).json({
      success: true,
      message: 'Trip stopped',
      data: bus,
    });
  } catch (error) {
    console.error('Error stopping trip:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

/**
 * GET /api/location-history/:busId
 * Get location history for a bus
 * Query params: ?limit=50&skip=0
 */
router.get('/location-history/:busId', async (req, res) => {
  try {
    const { busId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const locations = await Location.find({ busId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Location.countDocuments({ busId });

    res.status(200).json({
      success: true,
      data: locations,
      total,
      limit,
      skip,
    });
  } catch (error) {
    console.error('Error fetching location history:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

/**
 * PUT /api/bus/:busId
 * Update bus info (Admin only)
 * Requires Bearer token in Authorization header
 */
router.put('/bus/:busId', async (req, res) => {
  try {
    // Verify admin authentication
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const auth = verifyToken(token);
    if (!auth) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    const { busId } = req.params;
    const { busName, routeName, driverName } = req.body;

    const bus = await Bus.findOne({ busId });
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'Bus not found',
      });
    }

    if (busName !== undefined) bus.busName = busName;
    if (routeName !== undefined) bus.routeName = routeName;
    if (driverName !== undefined) bus.driverName = driverName;

    await bus.save();

    console.log(`✅ Bus updated: ${busId}`);
    res.status(200).json({
      success: true,
      message: 'Bus updated successfully',
      data: bus,
    });
  } catch (error) {
    console.error('Error updating bus:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

/**
 * DELETE /api/bus/:busId
 * Delete a bus and its location history (Admin only)
 * Requires Bearer token in Authorization header
 */
router.delete('/bus/:busId', async (req, res) => {
  try {
    // Verify admin authentication
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const auth = verifyToken(token);
    if (!auth) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    const { busId } = req.params;

    const bus = await Bus.findOneAndDelete({ busId });
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'Bus not found',
      });
    }

    // Also delete location history
    await Location.deleteMany({ busId });

    console.log(`✅ Bus deleted: ${busId}`);
    res.status(200).json({
      success: true,
      message: `Bus ${busId} deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting bus:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// ──────────────────────────────────────────────
//  REST-STYLE BUS ROUTES (matches frontend ApiService)
// ──────────────────────────────────────────────

/**
 * GET /api/buses/:busId
 * Get a single bus by ID
 */
router.get('/buses/:busId', async (req, res) => {
  try {
    const { busId } = req.params;
    const bus = await Bus.findOne({ busId });
    if (!bus) {
      return res.status(404).json({ success: false, message: 'Bus not found' });
    }
    res.status(200).json({ success: true, data: bus });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * POST /api/buses
 * Create a new bus (Admin only)
 */
router.post('/buses', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    const auth = token ? verifyToken(token) : null;
    // In development allow without token; in production enforce it
    if (process.env.NODE_ENV === 'production' && !auth) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { busId, busName, routeName, driverName, capacity, model, registrationPlate } = req.body;

    if (!busId || typeof busId !== 'string' || !busId.trim()) {
      return res.status(400).json({ success: false, message: 'Valid busId is required' });
    }

    const existing = await Bus.findOne({ busId: busId.trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Bus with this ID already exists' });
    }

    const newBus = new Bus({
      busId: busId.trim(),
      busName: busName || busId.trim(),
      routeName: routeName || '',
      driverName: driverName || '',
      driverPin: hashPin('1234'),
    });

    await newBus.save();
    res.status(201).json({ success: true, message: 'Bus created', data: newBus });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * PUT /api/buses/:busId
 * Update bus info
 */
router.put('/buses/:busId', async (req, res) => {
  try {
    const { busId } = req.params;
    const { busName, routeName, driverName, origin, destination, waypoints } = req.body;

    const bus = await Bus.findOne({ busId });
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found' });

    if (busName !== undefined) bus.busName = busName;
    if (routeName !== undefined) bus.routeName = routeName;
    if (driverName !== undefined) bus.driverName = driverName;
    if (origin !== undefined) bus.origin = origin;
    if (destination !== undefined) bus.destination = destination;
    if (waypoints !== undefined) bus.waypoints = waypoints;

    await bus.save();
    res.status(200).json({ success: true, message: 'Bus updated', data: bus });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * DELETE /api/buses/:busId
 * Delete a bus
 */
router.delete('/buses/:busId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    const auth = token ? verifyToken(token) : null;
    if (process.env.NODE_ENV === 'production' && !auth) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { busId } = req.params;
    const bus = await Bus.findOneAndDelete({ busId });
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found' });

    await Location.deleteMany({ busId });
    res.status(200).json({ success: true, message: `Bus ${busId} deleted` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// ──────────────────────────────────────────────
//  STUB ROUTES for drivers/routes (frontend calls these)
// ──────────────────────────────────────────────

router.get('/drivers', async (req, res) => {
  res.status(200).json({ success: true, data: [] });
});

router.post('/drivers', async (req, res) => {
  res.status(201).json({ success: true, data: req.body, message: 'Driver saved' });
});

router.put('/drivers/:id', async (req, res) => {
  res.status(200).json({ success: true, data: req.body });
});

router.get('/routes', async (req, res) => {
  // Return route info embedded in buses
  try {
    const buses = await Bus.find({ routeName: { $exists: true, $ne: '' } });
    const routes = buses
      .filter(b => b.origin && b.destination)
      .map(b => ({
        id: b.busId,
        name: b.routeName,
        origin: b.origin,
        destination: b.destination,
        waypoints: b.waypoints || [],
        busId: b.busId,
      }));
    res.status(200).json({ success: true, data: routes });
  } catch (error) {
    res.status(200).json({ success: true, data: [] });
  }
});

router.get('/routes/:id', async (req, res) => {
  try {
    const bus = await Bus.findOne({ busId: req.params.id });
    if (!bus) return res.status(404).json({ success: false, message: 'Route not found' });
    res.status(200).json({
      success: true,
      data: {
        id: bus.busId,
        name: bus.routeName,
        origin: bus.origin || '',
        destination: bus.destination || '',
        waypoints: bus.waypoints || [],
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/routes', async (req, res) => {
  res.status(201).json({ success: true, data: req.body });
});

router.put('/routes/:id', async (req, res) => {
  res.status(200).json({ success: true, data: req.body });
});

router.delete('/routes/:id', async (req, res) => {
  res.status(200).json({ success: true });
});

// ──────────────────────────────────────────────
//  SIMULATION ENDPOINT
//  POST /api/simulate/start  — begin emitting synthetic GPS for a bus
//  POST /api/simulate/stop   — stop simulation for a bus
// ──────────────────────────────────────────────

// In-memory simulation state { busId -> intervalId }
const activeSimulations = new Map();

// Agni College route waypoints (used when no custom waypoints supplied)
const DEFAULT_WAYPOINTS = [
  { lat: 12.8250, lng: 80.2210 },
  { lat: 12.8290, lng: 80.2190 },
  { lat: 12.8340, lng: 80.2170 },
  { lat: 12.8380, lng: 80.2150 },
  { lat: 12.8410, lng: 80.2130 },
  { lat: 12.8435, lng: 80.2100 },
  { lat: 12.8450, lng: 80.2070 },
  { lat: 12.8460, lng: 80.2050 },
  { lat: 12.8470, lng: 80.2035 },
  { lat: 12.8474, lng: 80.2026 },
];

/**
 * POST /api/simulate/start
 * Body: { busId, intervalMs? }
 * Starts a server-side simulation that emits location-update socket events.
 * The caller must pass the io instance; we attach it during server startup.
 */
router.post('/simulate/start', async (req, res) => {
  const { busId, intervalMs = 4000 } = req.body;

  if (!busId) {
    return res.status(400).json({ success: false, message: 'busId is required' });
  }

  // Stop any existing simulation for this bus
  if (activeSimulations.has(busId)) {
    clearInterval(activeSimulations.get(busId));
    activeSimulations.delete(busId);
  }

  // Ensure bus exists
  let bus = await Bus.findOne({ busId }).catch(() => null);
  if (!bus) {
    return res.status(404).json({ success: false, message: 'Bus not found' });
  }

  const waypoints = (bus.waypoints && bus.waypoints.length >= 2)
    ? bus.waypoints.map(wp => {
        const [lat, lng] = String(wp).split(',').map(Number);
        return { lat, lng };
      })
    : DEFAULT_WAYPOINTS;

  let idx = 0;

  // Mark bus active
  bus.isActive = true;
  await bus.save().catch(() => {});

  const io = router._io; // attached by server.js

  const tick = async () => {
    const wp = waypoints[idx % waypoints.length];
    const simSpeed = +(25 + Math.random() * 20).toFixed(1);

    // Persist to DB
    await Bus.findOneAndUpdate(
      { busId },
      { lastLocation: { latitude: wp.lat, longitude: wp.lng, timestamp: new Date() }, isActive: true }
    ).catch(() => {});

    // Emit to all watchers
    if (io) {
      io.to(`bus_${busId}`).emit('location-update', {
        busId,
        latitude:  wp.lat,
        longitude: wp.lng,
        accuracy:  5,
        speed:     simSpeed,
        timestamp: new Date(),
        simulated: true,
      });
    }

    idx = (idx + 1) % waypoints.length;
  };

  // First tick immediately
  tick();
  const intervalId = setInterval(tick, Math.max(1000, intervalMs));
  activeSimulations.set(busId, intervalId);

  console.log(`▶ Simulation started for bus: ${busId} (${waypoints.length} waypoints, ${intervalMs}ms)`);
  res.status(200).json({
    success: true,
    message: `Simulation started for bus ${busId}`,
    waypoints: waypoints.length,
    intervalMs,
  });
});

/**
 * POST /api/simulate/stop
 * Body: { busId }
 */
router.post('/simulate/stop', async (req, res) => {
  const { busId } = req.body;

  if (!busId) {
    return res.status(400).json({ success: false, message: 'busId is required' });
  }

  if (activeSimulations.has(busId)) {
    clearInterval(activeSimulations.get(busId));
    activeSimulations.delete(busId);

    // Mark bus inactive
    await Bus.findOneAndUpdate({ busId }, { isActive: false }).catch(() => {});

    const io = router._io;
    if (io) {
      io.emit('bus-status-change', { busId, status: 'offline', timestamp: new Date() });
    }

    console.log(`■ Simulation stopped for bus: ${busId}`);
    return res.status(200).json({ success: true, message: `Simulation stopped for bus ${busId}` });
  }

  res.status(404).json({ success: false, message: 'No active simulation for this bus' });
});

/**
 * GET /api/simulate/status
 * Returns list of currently simulated buses
 */
router.get('/simulate/status', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      activeBuses: Array.from(activeSimulations.keys()),
      count: activeSimulations.size,
    },
  });
});

// Attach verifyToken so server.js can do: require('./routes/api').verifyToken
router.verifyToken = verifyToken;
module.exports = router;
