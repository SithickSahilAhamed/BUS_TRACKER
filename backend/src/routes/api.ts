/**
 * API Routes — TypeScript
 * All admin/driver routes are protected via Firebase Auth middleware
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Bus, { IBusDocument } from '../models/Bus';
import Location from '../models/Location';
import User from '../models/User';
import Driver from '../models/Driver';
import Route from '../models/Route';
import Trip from '../models/Trip';
import { requireAuth, requireRole } from '../middleware/auth';
import { admin, adminInitialized } from '../config/firebase';
import { hashPin, createDriverToken, verifyDriverToken } from '../lib/auth';
import {
  validateBusId,
  validateLatitude,
  validateLongitude,
  validateAccuracy,
  validateSpeed,
  validateEmail,
  validateString,
  validateNumberRange,
  sanitizeString,
} from '../lib/validation';
import logger from '../lib/logger';

const router = Router();

const isProd = process.env.NODE_ENV === 'production';

const serializeBus = (bus: IBusDocument) => ({
  id: bus._id?.toString(),
  busId: bus.busId,
  busName: bus.busName,
  routeName: bus.routeName,
  driverName: bus.driverName,
  isActive: bus.isActive,
  lastLocation: bus.lastLocation,
  busNumber: bus.busNumber || bus.busName || bus.busId,
  capacity: bus.capacity || 0,
  model: bus.model || '',
  registrationPlate: bus.registrationPlate || '',
  currentRoute: bus.currentRoute || bus.routeName || '',
  assignedDriver: bus.assignedDriver || bus.driverName || '',
  status: bus.status || (bus.isActive ? 'active' : 'inactive'),
  createdAt: bus.createdAt,
  updatedAt: bus.updatedAt,
});

const serializeDriver = (driver: any) => ({
  id: driver._id?.toString(),
  userId: driver.userId,
  name: driver.name,
  phoneNumber: driver.phoneNumber,
  licenseNumber: driver.licenseNumber,
  assignedBus: driver.assignedBus,
  status: driver.status,
  rating: driver.rating,
  createdAt: driver.createdAt,
  updatedAt: driver.updatedAt,
});

const serializeRoute = (route: any) => ({
  id: route._id?.toString(),
  name: route.name,
  origin: route.origin,
  destination: route.destination,
  waypoints: route.waypoints,
  estimatedDuration: route.estimatedDuration,
  distance: route.distance,
  isActive: route.isActive,
  createdAt: route.createdAt,
  updatedAt: route.updatedAt,
});

const serializeTrip = (trip: any) => ({
  id: trip._id?.toString(),
  busId: trip.busId,
  routeId: trip.routeId,
  driverId: trip.driverId,
  startTime: trip.startTime,
  endTime: trip.endTime,
  status: trip.status,
  distance: trip.distance,
  duration: trip.duration,
  studentsCount: trip.studentsCount,
  createdAt: trip.createdAt,
  updatedAt: trip.updatedAt,
});

const resolveBusQuery = (param: string) => {
  if (mongoose.Types.ObjectId.isValid(param)) {
    return { _id: param };
  }
  return { busId: validateBusId(param) };
};

// ──────────────────────────────────────────────
//  DRIVER PIN LOGIN ROUTES
// ──────────────────────────────────────────────

/** POST /api/driver/login — Login with Bus ID + PIN */
router.post('/driver/login', async (req: Request, res: Response) => {
  try {
    const { busId, pin } = req.body;
    if (!busId || !pin) {
      return res.status(400).json({ success: false, message: 'Bus ID and PIN required' });
    }

    const validatedBusId = validateBusId(busId);
    const pinValue = validateString(String(pin), 'pin', 4, 12);

    const bus = await Bus.findOne({ busId: validatedBusId });
    if (!bus) {
      return res.status(404).json({ success: false, message: 'Bus not found' });
    }

    const hashedPin = hashPin(pinValue);
    // Explicitly casting or checking as Bus model now has it
    if (hashedPin !== (bus as any).driverPin) {
      return res.status(401).json({ success: false, message: 'Incorrect PIN' });
    }

    const token = createDriverToken(validatedBusId);
    res.json({
      success: true,
      data: {
        token,
        busId: validatedBusId,
        bus: serializeBus(bus),
      },
    });
  } catch (err) {
    logger.error('Driver login failed', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** POST /api/driver/verify-token — Verify driver session */
router.post('/driver/verify-token', (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'No token' });
  const result = verifyDriverToken(token);
  if (!result) return res.status(401).json({ success: false, message: 'Invalid token' });
  res.json({ success: true, data: result });
});

// API compatibility for frontend
router.post('/auth/verify-token', (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'No token' });
  const result = verifyDriverToken(token);
  if (!result) return res.status(401).json({ success: false, message: 'Invalid token' });
  res.json({ success: true, data: result });
});

// ─── PUBLIC ROUTES ──────────────────────────────────────────────────────────
/** POST /api/user/sync — Sync Firebase user to MongoDB after client login */
router.post('/user/sync', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Firebase token required' });

    if (!adminInitialized) {
      return res.status(503).json({ success: false, message: 'Auth service not ready (admin not init)' });
    }

    // Verify token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(token);
    const { uid, email, name, picture } = decodedToken;

    // Use current or default role
    // Upsert User in MongoDB
    let user = await User.findOne({ firebaseUid: uid });
    if (!user) {
      user = new User({ firebaseUid: uid, email, displayName: name || '', photoURL: picture || '', role: 'student' as any });
    } else {
      user.displayName = name || user.displayName;
      // update email/picture if changed
    }
    await user.save();

    res.status(200).json({ success: true, message: 'User synced successfully', data: user });
  } catch (error: any) {
    console.error('Firebase Auth Sync Error:', error);
    res.status(401).json({ success: false, message: 'Invalid Firebase token', error: error.message });
  }
});

/** GET /api/user/sync — Return current user (frontend compatibility) */
router.get('/user/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user?.uid });
    res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/** GET /api/buses — List all buses (public, students use this) */
router.get('/buses', async (_req: Request, res: Response) => {
  try {
    const buses = await Bus.find({}).sort({ busId: 1 });
    res.json({
      success: true,
      data: buses.map((b) => serializeBus(b)),
    });
  } catch (err) {
    logger.error('Failed to list buses', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** GET /api/buses/:busId — Get bus details (public) */
router.get('/buses/:busId', async (req: Request, res: Response) => {
  try {
    const bus = await Bus.findOne(resolveBusQuery(req.params.busId));
    if (!bus) {
      res.status(404).json({ success: false, message: 'Bus not found' });
      return;
    }
    res.json({ success: true, data: serializeBus(bus) });
  } catch (err) {
    logger.error('Failed to get bus details', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** GET /api/location/:busId — Latest bus location (public) */
router.get('/location/:busId', async (req: Request, res: Response) => {
  try {
    const busId = validateBusId(req.params.busId);
    const bus = await Bus.findOne({ busId });
    if (!bus) {
      res.status(404).json({ success: false, message: 'Bus not found' });
      return;
    }
    res.json({
      success: true,
      data: {
        ...serializeBus(bus),
      },
    });
  } catch (err) {
    logger.error('Failed to get latest location', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** GET /api/location-history/:busId — Paginated history (public) */
router.get('/location-history/:busId', async (req: Request, res: Response) => {
  try {
    const busId = validateBusId(req.params.busId);
    const limit = Math.min(validateNumberRange(req.query.limit ?? 50, 'limit', 1, 500), 500);
    const skip = Math.max(validateNumberRange(req.query.skip ?? 0, 'skip', 0, 100000), 0);
    const locations = await Location.find({ busId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip);
    const total = await Location.countDocuments({ busId });
    res.json({ success: true, data: locations, total, limit, skip });
  } catch (err) {
    logger.error('Failed to load location history', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** GET /api/location/get-locations — Legacy compatibility */
router.get('/location/get-locations', async (req: Request, res: Response) => {
  try {
    if (!req.query.busId) {
      res.status(400).json({ success: false, message: 'busId is required' });
      return;
    }
    const busId = validateBusId(req.query.busId);
    const limit = Math.min(validateNumberRange(req.query.limit ?? 50, 'limit', 1, 500), 500);
    const locations = await Location.find({ busId }).sort({ timestamp: -1 }).limit(limit);
    res.json({ success: true, data: locations, total: locations.length, limit, skip: 0 });
  } catch (err) {
    logger.error('Failed to load locations', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** GET /api/location/location-history — Legacy compatibility */
router.get('/location/location-history', async (req: Request, res: Response) => {
  try {
    if (!req.query.busId) {
      res.status(400).json({ success: false, message: 'busId is required' });
      return;
    }
    const busId = validateBusId(req.query.busId);
    const limit = Math.min(validateNumberRange(req.query.limit ?? 50, 'limit', 1, 500), 500);
    const locations = await Location.find({ busId }).sort({ timestamp: -1 }).limit(limit);
    res.json({ success: true, data: locations, total: locations.length, limit, skip: 0 });
  } catch (err) {
    logger.error('Failed to load location history', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── AUTH INFO ────────────────────────────────────────────────────────────────

/** GET /api/me — Get current user info (authenticated) */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user?.uid });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DRIVER ROUTES ───────────────────────────────────────────────────────────

const postLocationHandler = async (req: Request, res: Response) => {
  try {
    const { busId, latitude, longitude, accuracy, speed, token } = req.body;

    if (isProd && !token) {
      return res.status(401).json({ success: false, message: 'Driver token required' });
    }

    if (!busId || latitude === undefined || longitude === undefined) {
      res.status(400).json({ success: false, message: 'Missing required fields' });
      return;
    }

    const validatedBusId = validateBusId(busId);
    const validatedLat = validateLatitude(latitude);
    const validatedLng = validateLongitude(longitude);
    const validatedAccuracy = validateAccuracy(accuracy);
    const validatedSpeed = validateSpeed(speed);

    if (token) {
      const auth = verifyDriverToken(token);
      if (!auth || auth.busId !== validatedBusId) {
        return res.status(401).json({ success: false, message: 'Invalid driver token' });
      }
    }

    let bus = await Bus.findOne({ busId: validatedBusId });
    if (!bus) {
      bus = new Bus({
        busId: validatedBusId,
        lastLocation: { latitude: validatedLat, longitude: validatedLng, timestamp: new Date() },
        isActive: true,
        status: 'active',
      });
    } else {
      bus.lastLocation = {
        latitude: validatedLat,
        longitude: validatedLng,
        accuracy: validatedAccuracy,
        speed: validatedSpeed,
        timestamp: new Date(),
      };
      bus.isActive = true;
      bus.status = 'active';
    }
    await bus.save();

    await new Location({
      busId: validatedBusId,
      latitude: validatedLat,
      longitude: validatedLng,
      accuracy: validatedAccuracy,
      speed: validatedSpeed,
      timestamp: new Date(),
    }).save();

    res.json({ success: true, message: 'Location updated', data: { busId: validatedBusId, latitude: validatedLat, longitude: validatedLng } });
  } catch (err) {
    logger.error('Driver location update failed', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** POST /api/location — Driver sends GPS update (REST Fallback) */
router.post('/location', postLocationHandler);

/** POST /api/location/post-location — Legacy compatibility */
router.post('/location/post-location', postLocationHandler);

/** POST /api/bus/:busId/start-trip */
router.post('/bus/:busId/start-trip', async (req: Request, res: Response) => {
  try {
    const { busId } = req.params;
    const { token } = req.body;

    const validatedBusId = validateBusId(busId);

    if (isProd && !token) {
      return res.status(401).json({ success: false, message: 'Driver token required' });
    }

    if (token) {
      const auth = verifyDriverToken(token);
      if (!auth || auth.busId !== validatedBusId) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
    }

    let bus = await Bus.findOne({ busId: validatedBusId });
    if (!bus) {
      bus = new Bus({ busId: validatedBusId, isActive: true, status: 'active' });
    } else {
      bus.isActive = true;
      bus.status = 'active';
    }
    await bus.save();
    res.json({ success: true, message: 'Trip started', data: serializeBus(bus) });
  } catch (err) {
    logger.error('Trip start failed', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** POST /api/bus/:busId/stop-trip */
router.post('/bus/:busId/stop-trip', async (req: Request, res: Response) => {
  try {
    const { busId } = req.params;
    const { token } = req.body;

    const validatedBusId = validateBusId(busId);

    if (isProd && !token) {
      return res.status(401).json({ success: false, message: 'Driver token required' });
    }

    if (token) {
      const auth = verifyDriverToken(token);
      if (!auth || auth.busId !== validatedBusId) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
    }

    const bus = await Bus.findOne({ busId: validatedBusId });
    if (!bus) {
      res.status(404).json({ success: false, message: 'Bus not found' });
      return;
    }
    bus.isActive = false;
    bus.status = 'inactive';
    await bus.save();
    res.json({ success: true, message: 'Trip stopped', data: serializeBus(bus) });
  } catch (err) {
    logger.error('Trip stop failed', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────

const createBusHandler = async (req: Request, res: Response) => {
  try {
    const {
      busId,
      busNumber,
      busName,
      routeName,
      driverName,
      capacity,
      model,
      registrationPlate,
      currentRoute,
      assignedDriver,
      status,
      isActive,
      driverPin,
    } = req.body;
    if (!busId) {
      res.status(400).json({ success: false, message: 'busId is required' });
      return;
    }
    const validatedBusId = validateBusId(busId);
    if (await Bus.findOne({ busId: validatedBusId })) {
      res.status(400).json({ success: false, message: 'Bus already exists' });
      return;
    }

    if (isProd && !driverPin) {
      res.status(400).json({ success: false, message: 'driverPin is required in production' });
      return;
    }

    const normalizedStatus = status === 'maintenance' ? 'maintenance' : status === 'active' ? 'active' : status === 'inactive' ? 'inactive' : undefined;
    const activeFlag = typeof isActive === 'boolean' ? isActive : normalizedStatus === 'active';

    const bus = await new Bus({
      busId: validatedBusId,
      busName: busName ? sanitizeString(busName) : `Bus ${validatedBusId}`,
      busNumber: busNumber ? sanitizeString(busNumber) : busName ? sanitizeString(busName) : validatedBusId,
      routeName: routeName ? sanitizeString(routeName) : '',
      driverName: driverName ? sanitizeString(driverName) : '',
      capacity: capacity !== undefined ? validateNumberRange(capacity, 'capacity', 0, 200) : 0,
      model: model ? sanitizeString(model) : '',
      registrationPlate: registrationPlate ? sanitizeString(registrationPlate) : '',
      currentRoute: currentRoute ? sanitizeString(currentRoute) : routeName ? sanitizeString(routeName) : '',
      assignedDriver: assignedDriver ? sanitizeString(assignedDriver) : driverName ? sanitizeString(driverName) : '',
      status: normalizedStatus || (activeFlag ? 'active' : 'inactive'),
      isActive: activeFlag,
      ...(driverPin && { driverPin: hashPin(validateString(String(driverPin), 'driverPin', 4, 16)) }),
    }).save();

    res.status(201).json({ success: true, data: serializeBus(bus) });
  } catch (err) {
    logger.error('Create bus failed', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** POST /api/bus/create — Admin creates a new bus */
router.post('/bus/create', requireAuth, requireRole('admin'), createBusHandler);

/** POST /api/buses — Admin creates a new bus (frontend compatibility) */
router.post('/buses', requireAuth, requireRole('admin'), createBusHandler);

const deleteBusHandler = async (req: Request, res: Response) => {
  try {
    const result = await Bus.findOneAndDelete(resolveBusQuery(req.params.busId));
    if (!result) {
      res.status(404).json({ success: false, message: 'Bus not found' });
      return;
    }
    res.json({ success: true, message: 'Bus deleted' });
  } catch (err) {
    logger.error('Delete bus failed', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** DELETE /api/bus/:busId — Admin deletes a bus */
router.delete('/bus/:busId', requireAuth, requireRole('admin'), deleteBusHandler);

/** DELETE /api/buses/:busId — Admin deletes a bus (frontend compatibility) */
router.delete('/buses/:busId', requireAuth, requireRole('admin'), deleteBusHandler);

const updateBusHandler = async (req: Request, res: Response) => {
  try {
    const busQuery = resolveBusQuery(req.params.busId);
    const {
      busName,
      busNumber,
      routeName,
      driverName,
      capacity,
      model,
      registrationPlate,
      currentRoute,
      assignedDriver,
      status,
      isActive,
      driverPin,
    } = req.body;

    const updates: Record<string, any> = {};
    if (busName !== undefined) updates.busName = sanitizeString(busName);
    if (busNumber !== undefined) updates.busNumber = sanitizeString(busNumber);
    if (routeName !== undefined) updates.routeName = sanitizeString(routeName);
    if (driverName !== undefined) updates.driverName = sanitizeString(driverName);
    if (capacity !== undefined) updates.capacity = validateNumberRange(capacity, 'capacity', 0, 200);
    if (model !== undefined) updates.model = sanitizeString(model);
    if (registrationPlate !== undefined) updates.registrationPlate = sanitizeString(registrationPlate);
    if (currentRoute !== undefined) updates.currentRoute = sanitizeString(currentRoute);
    if (assignedDriver !== undefined) updates.assignedDriver = sanitizeString(assignedDriver);
    if (status !== undefined) {
      updates.status = status;
      updates.isActive = status === 'active';
    }
    if (isActive !== undefined) {
      updates.isActive = Boolean(isActive);
      updates.status = isActive ? 'active' : 'inactive';
    }
    if (driverPin) {
      updates.driverPin = hashPin(validateString(String(driverPin), 'driverPin', 4, 16));
    }

    const bus = await Bus.findOneAndUpdate(busQuery, { $set: updates }, { new: true });
    if (!bus) {
      res.status(404).json({ success: false, message: 'Bus not found' });
      return;
    }
    res.json({ success: true, data: serializeBus(bus) });
  } catch (err) {
    logger.error('Update bus failed', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** PUT /api/bus/:busId — Admin updates bus info */
router.put('/bus/:busId', requireAuth, requireRole('admin'), updateBusHandler);

/** PUT /api/buses/:busId — Admin updates bus info (frontend compatibility) */
router.put('/buses/:busId', requireAuth, requireRole('admin'), updateBusHandler);

/** POST /api/admin/create-driver — Admin creates a driver account */
router.post('/admin/create-driver', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { email, password, displayName, busId } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'email and password required' });
      return;
    }

    const validatedEmail = validateEmail(email);
    const validatedName = displayName ? validateString(displayName, 'displayName', 1, 64) : 'Driver';

    let uid: string;
    if (adminInitialized) {
      const firebaseUser = await admin.auth().createUser({ email: validatedEmail, password, displayName: validatedName });
      uid = firebaseUser.uid;
    } else {
      // Dev mode: generate a fake UID
      uid = `dev-${Date.now()}`;
    }

    if (await User.findOne({ email: validatedEmail })) {
      res.status(400).json({ success: false, message: 'User already exists' });
      return;
    }

    const user = await new User({ firebaseUid: uid, email: validatedEmail, displayName: validatedName, role: 'driver', busId }).save();

    const existingDriver = await Driver.findOne({ userId: uid });
    if (!existingDriver) {
      await new Driver({
        userId: uid,
        name: validatedName,
        phoneNumber: '',
        licenseNumber: '',
        assignedBus: busId ? validateBusId(busId) : '',
        status: 'active',
      }).save();
    }
    res.status(201).json({ success: true, data: user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    res.status(500).json({ success: false, message });
  }
});

/** GET /api/admin/drivers — List all drivers */
router.get('/admin/drivers', requireAuth, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const drivers = await User.find({ role: 'driver' });
    res.json({ success: true, data: drivers });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** GET /api/drivers — List driver profiles (frontend compatibility) */
router.get('/drivers', requireAuth, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const drivers = await Driver.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: drivers.map((d) => serializeDriver(d)) });
  } catch (err) {
    logger.error('Failed to list drivers', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** POST /api/drivers — Create driver profile (frontend compatibility) */
router.post('/drivers', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { userId, name, phoneNumber, licenseNumber, assignedBus, status, rating } = req.body;
    const validatedName = validateString(name, 'name', 1, 80);
    const validatedPhone = phoneNumber ? validateString(phoneNumber, 'phoneNumber', 7, 24) : '';
    const validatedLicense = licenseNumber ? validateString(licenseNumber, 'licenseNumber', 3, 40) : '';
    const normalizedStatus = status === 'inactive' || status === 'on-leave' ? status : 'active';

    const driver = await new Driver({
      userId: userId ? sanitizeString(userId) : '',
      name: validatedName,
      phoneNumber: validatedPhone,
      licenseNumber: validatedLicense,
      assignedBus: assignedBus ? validateBusId(assignedBus) : '',
      status: normalizedStatus,
      rating: rating !== undefined ? validateNumberRange(rating, 'rating', 0, 5) : 0,
    }).save();

    res.status(201).json({ success: true, data: serializeDriver(driver) });
  } catch (err) {
    logger.error('Failed to create driver profile', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** PUT /api/drivers/:driverId — Update driver profile (frontend compatibility) */
router.put('/drivers/:driverId', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params;
    const { name, phoneNumber, licenseNumber, assignedBus, status, rating } = req.body;

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = validateString(name, 'name', 1, 80);
    if (phoneNumber !== undefined) updates.phoneNumber = validateString(phoneNumber, 'phoneNumber', 7, 24);
    if (licenseNumber !== undefined) updates.licenseNumber = validateString(licenseNumber, 'licenseNumber', 3, 40);
    if (assignedBus !== undefined) updates.assignedBus = assignedBus ? validateBusId(assignedBus) : '';
    if (status !== undefined) updates.status = status === 'inactive' || status === 'on-leave' ? status : 'active';
    if (rating !== undefined) updates.rating = validateNumberRange(rating, 'rating', 0, 5);

    const driver = await Driver.findByIdAndUpdate(driverId, { $set: updates }, { new: true });
    if (!driver) {
      res.status(404).json({ success: false, message: 'Driver not found' });
      return;
    }
    res.json({ success: true, data: serializeDriver(driver) });
  } catch (err) {
    logger.error('Failed to update driver profile', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** POST /api/admin/seed — Create first admin (one-time setup) */
router.post('/admin/seed', async (req: Request, res: Response) => {
  try {
    if (isProd) {
      res.status(403).json({ success: false, message: 'Admin seeding disabled in production' });
      return;
    }
    const count = await User.countDocuments({ role: 'admin' });
    if (count > 0) {
      res.status(400).json({ success: false, message: 'Admin already exists' });
      return;
    }
    const { email, password, displayName } = req.body;
    let uid = `dev-admin-${Date.now()}`;
    if (adminInitialized) {
      const fbUser = await admin.auth().createUser({ email, password, displayName });
      uid = fbUser.uid;
    }
    const admin_user = await new User({ firebaseUid: uid, email, displayName: displayName || 'Admin', role: 'admin' }).save();
    res.status(201).json({ success: true, data: admin_user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    res.status(500).json({ success: false, message });
  }
});

// ─── ROUTE MANAGEMENT (React frontend) ─────────────────────────────────────

/** GET /api/routes — List routes (public for student map) */
router.get('/routes', async (_req: Request, res: Response) => {
  try {
    const routes = await Route.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: routes.map((r) => serializeRoute(r)) });
  } catch (err) {
    logger.error('Failed to list routes', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** GET /api/routes/:routeId — Get route detail (public) */
router.get('/routes/:routeId', async (req: Request, res: Response) => {
  try {
    const route = await Route.findById(req.params.routeId);
    if (!route) {
      res.status(404).json({ success: false, message: 'Route not found' });
      return;
    }
    res.json({ success: true, data: serializeRoute(route) });
  } catch (err) {
    logger.error('Failed to get route', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** POST /api/routes — Create route (admin only) */
router.post('/routes', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, origin, destination, waypoints, estimatedDuration, distance, isActive } = req.body;
    const route = await new Route({
      name: validateString(name, 'name', 2, 120),
      origin: origin ? sanitizeString(origin) : '',
      destination: destination ? sanitizeString(destination) : '',
      waypoints: Array.isArray(waypoints) ? waypoints : [],
      estimatedDuration: estimatedDuration !== undefined ? validateNumberRange(estimatedDuration, 'estimatedDuration', 0, 10000) : 0,
      distance: distance !== undefined ? validateNumberRange(distance, 'distance', 0, 100000) : 0,
      isActive: typeof isActive === 'boolean' ? isActive : true,
    }).save();
    res.status(201).json({ success: true, data: serializeRoute(route) });
  } catch (err) {
    logger.error('Failed to create route', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** PUT /api/routes/:routeId — Update route (admin only) */
router.put('/routes/:routeId', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const updates: Record<string, any> = {};
    const { name, origin, destination, waypoints, estimatedDuration, distance, isActive } = req.body;
    if (name !== undefined) updates.name = validateString(name, 'name', 2, 120);
    if (origin !== undefined) updates.origin = sanitizeString(origin);
    if (destination !== undefined) updates.destination = sanitizeString(destination);
    if (waypoints !== undefined) updates.waypoints = Array.isArray(waypoints) ? waypoints : [];
    if (estimatedDuration !== undefined) updates.estimatedDuration = validateNumberRange(estimatedDuration, 'estimatedDuration', 0, 10000);
    if (distance !== undefined) updates.distance = validateNumberRange(distance, 'distance', 0, 100000);
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const route = await Route.findByIdAndUpdate(req.params.routeId, { $set: updates }, { new: true });
    if (!route) {
      res.status(404).json({ success: false, message: 'Route not found' });
      return;
    }
    res.json({ success: true, data: serializeRoute(route) });
  } catch (err) {
    logger.error('Failed to update route', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** DELETE /api/routes/:routeId — Delete route (admin only) */
router.delete('/routes/:routeId', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const route = await Route.findByIdAndDelete(req.params.routeId);
    if (!route) {
      res.status(404).json({ success: false, message: 'Route not found' });
      return;
    }
    res.json({ success: true, message: 'Route deleted' });
  } catch (err) {
    logger.error('Failed to delete route', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── TRIP ENDPOINTS (React frontend) ───────────────────────────────────────

/** POST /api/trip/start-trip — Create a trip */
router.post('/trip/start-trip', async (req: Request, res: Response) => {
  try {
    const { busId, routeId, driverId, token } = req.body;
    const validatedBusId = validateBusId(busId);

    if (isProd && !token) {
      return res.status(401).json({ success: false, message: 'Driver token required' });
    }
    if (token) {
      const auth = verifyDriverToken(token);
      if (!auth || auth.busId !== validatedBusId) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
    }

    const trip = await new Trip({
      busId: validatedBusId,
      routeId: routeId ? sanitizeString(routeId) : '',
      driverId: driverId ? sanitizeString(driverId) : '',
      startTime: new Date(),
      status: 'active',
    }).save();

    await Bus.findOneAndUpdate(
      { busId: validatedBusId },
      { $set: { isActive: true, status: 'active' } },
      { new: true }
    );

    res.status(201).json({ success: true, data: serializeTrip(trip) });
  } catch (err) {
    logger.error('Failed to start trip', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/** POST /api/trip/stop-trip — End a trip */
router.post('/trip/stop-trip', async (req: Request, res: Response) => {
  try {
    const { tripId, token } = req.body;
    if (!tripId) {
      res.status(400).json({ success: false, message: 'tripId is required' });
      return;
    }

    if (isProd && !token) {
      return res.status(401).json({ success: false, message: 'Driver token required' });
    }

    const trip = await Trip.findById(tripId);
    if (!trip) {
      res.status(404).json({ success: false, message: 'Trip not found' });
      return;
    }

    if (token) {
      const auth = verifyDriverToken(token);
      if (!auth || auth.busId !== trip.busId) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
    }

    trip.status = 'completed';
    trip.endTime = new Date();
    await trip.save();

    await Bus.findOneAndUpdate(
      { busId: trip.busId },
      { $set: { isActive: false, status: 'inactive' } },
      { new: true }
    );

    res.json({ success: true, data: serializeTrip(trip) });
  } catch (err) {
    logger.error('Failed to stop trip', err instanceof Error ? err : new Error(String(err)));
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
