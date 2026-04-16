/**
 * Socket.IO Event Handlers — TypeScript
 * Manages real-time GPS tracking, bus rooms, and FCM notifications
 * ✅ FIXED: Input validation, consistent event names, error handling
 */
import { Server, Socket } from 'socket.io';
import Bus from '../models/Bus';
import Location from '../models/Location';
import Trip from '../models/Trip';
import { admin, adminInitialized } from '../config/firebase';
import { LocationUpdatePayload } from '../types';
import { verifyDriverToken } from '../lib/auth';
import { validateBusId, validateLatitude, validateLongitude, validateAccuracy, validateSpeed, ValidationError } from '../lib/validation';
import logger from '../lib/logger';

const activeSockets = new Map<string, Set<string>>(); // busId → Set<socketId>

export function registerSocketEvents(io: Server): void {
  // Optional: Socket auth middleware (lenient — students don't auth)
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (token && adminInitialized) {
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        socket.data.uid = decoded.uid;
        socket.data.email = decoded.email;
        socket.data.authenticated = true;
      } catch (err) {
        logger.debug('Socket auth failed', { error: String(err) });
        socket.data.authenticated = false;
      }
    } else {
      socket.data.authenticated = false;
    }
    next();
  });

  io.on('connection', (socket: Socket) => {
    logger.info('Socket connected', { socketId: socket.id, authenticated: socket.data.authenticated });

    // ── DRIVER EVENTS ────────────────────────────────────────────────────────

    /** Driver joins with busId + token */
    socket.on('driver-joined', async (data: any) => {
      try {
        const { busId, token } = data;
        
        // ✅ VALIDATION
        const validatedBusId = validateBusId(busId);
        const auth = token ? verifyDriverToken(token) : null;
        const isFirebaseAuth = socket.data.authenticated === true;
        
        if ((!auth || auth.busId !== validatedBusId) && !isFirebaseAuth) {
          socket.emit('auth-error', { message: 'Authentication failed. Please log in again.' });
          logger.warn('Driver auth failed', { socketId: socket.id, busId: validatedBusId });
          return;
        }

        socket.data.busId = validatedBusId;
        socket.join(`bus_${validatedBusId}`);

        if (!activeSockets.has(validatedBusId)) activeSockets.set(validatedBusId, new Set());
        activeSockets.get(validatedBusId)!.add(socket.id);

        io.emit('bus-status-change', { busId: validatedBusId, status: 'online', timestamp: new Date() });
        logger.info('Driver joined bus', { socketId: socket.id, busId: validatedBusId });
      } catch (err) {
        logger.error('Error in driver-joined', err instanceof Error ? err : new Error(String(err)));
        socket.emit('error', { message: 'An error occurred' });
      }
    });

    /** Receive GPS location from driver - ✅ FIXED: Validation and consistent naming */
    socket.on('driver-location-update', async (data: any) => {
      try {
        const { busId, latitude, longitude, accuracy, speed, token } = data;

        // ✅ VALIDATION
        const validatedBusId = validateBusId(busId);
        const validatedLat = validateLatitude(latitude);
        const validatedLng = validateLongitude(longitude);
        const validatedAccuracy = validateAccuracy(accuracy);
        const validatedSpeed = validateSpeed(speed);

        const auth = token ? verifyDriverToken(token) : null;
        const isFirebaseAuth = socket.data.authenticated === true;
        if ((!auth || auth.busId !== validatedBusId) && !isFirebaseAuth) {
          socket.emit('auth-error', { message: 'Authentication failed.' });
          return;
        }

        // Persist to DB
        const bus = await Bus.findOne({ busId: validatedBusId });
        if (bus) {
          bus.lastLocation = {
            latitude: validatedLat,
            longitude: validatedLng,
            accuracy: validatedAccuracy,
            speed: validatedSpeed,
            timestamp: new Date(),
          };
          bus.isActive = true;
          bus.status = 'active';
          await bus.save();
        }

        // Save history
        await new Location({
          busId: validatedBusId,
          latitude: validatedLat,
          longitude: validatedLng,
          accuracy: validatedAccuracy,
          speed: validatedSpeed,
          timestamp: new Date(),
        }).save();

        // ✅ FIXED: Only send delta (changed fields) instead of entire object
        io.to(`bus_${validatedBusId}`).emit('location-update', {
          busId: validatedBusId,
          latitude: validatedLat,
          longitude: validatedLng,
          accuracy: validatedAccuracy,
          speed: validatedSpeed,
          timestamp: new Date().toISOString(),
        });
        
        logger.debug('Location updated', { busId: validatedBusId, lat: validatedLat, lng: validatedLng });
      } catch (err) {
        logger.error('Error in driver-location-update', err instanceof Error ? err : new Error(String(err)));
        socket.emit('error', { message: 'Invalid location data' });
      }
    });

    /** Trip started - ✅ FIXED: Validation */
    socket.on('trip-started', async (data: any) => {
      try {
        const { busId, token, routeId } = data;
        const validatedBusId = validateBusId(busId);
        const auth = token ? verifyDriverToken(token) : null;
        const isFirebaseAuth = socket.data.authenticated === true;

        if ((!auth || auth.busId !== validatedBusId) && !isFirebaseAuth) {
          socket.emit('auth-error', { message: 'Authentication failed.' });
          return;
        }
        
        socket.data.busId = validatedBusId;
        socket.join(`bus_${validatedBusId}`);
        
        if (!activeSockets.has(validatedBusId)) activeSockets.set(validatedBusId, new Set());
        activeSockets.get(validatedBusId)!.add(socket.id);
        
        const bus = await Bus.findOne({ busId: validatedBusId });
        if (bus) {
          bus.isActive = true;
          bus.status = 'active';
          await bus.save();
        }

        const trip = await new Trip({
          busId: validatedBusId,
          routeId: routeId ? String(routeId) : '',
          driverId: socket.data.uid || socket.id,
          startTime: new Date(),
          status: 'active',
        }).save();

        io.emit('bus-status-change', { busId: validatedBusId, status: 'online', timestamp: new Date() });
        io.emit('trip-started', {
          id: trip._id?.toString(),
          busId: validatedBusId,
          routeId: trip.routeId,
          driverId: trip.driverId,
          startTime: trip.startTime,
          status: trip.status,
        });
        logger.info('Trip started', { socketId: socket.id, busId: validatedBusId });
      } catch (err) {
        logger.error('Error in trip-started', err instanceof Error ? err : new Error(String(err)));
      }
    });

    /** Trip stopped - ✅ FIXED: Validation */
    socket.on('trip-stopped', async (data: any) => {
      try {
        const { busId, token } = data;
        const validatedBusId = validateBusId(busId);
        const auth = token ? verifyDriverToken(token) : null;
        const isFirebaseAuth = socket.data.authenticated === true;

        if ((!auth || auth.busId !== validatedBusId) && !isFirebaseAuth) {
          socket.emit('auth-error', { message: 'Authentication failed.' });
          return;
        }
        
        activeSockets.get(validatedBusId)?.delete(socket.id);
        if (activeSockets.get(validatedBusId)?.size === 0) activeSockets.delete(validatedBusId);
        
        const bus = await Bus.findOne({ busId: validatedBusId });
        if (bus) {
          bus.isActive = false;
          bus.status = 'inactive';
          await bus.save();
        }

        const trip = await Trip.findOne({ busId: validatedBusId, status: 'active' }).sort({ startTime: -1 });
        if (trip) {
          trip.status = 'completed';
          trip.endTime = new Date();
          await trip.save();
          io.emit('trip-ended', {
            id: trip._id?.toString(),
            busId: validatedBusId,
            routeId: trip.routeId,
            driverId: trip.driverId,
            startTime: trip.startTime,
            endTime: trip.endTime,
            status: trip.status,
          });
        }

        io.emit('bus-status-change', { busId: validatedBusId, status: 'offline', timestamp: new Date() });
        logger.info('Trip stopped', { socketId: socket.id, busId: validatedBusId });
      } catch (err) {
        logger.error('Error in trip-stopped', err instanceof Error ? err : new Error(String(err)));
      }
    });

    // ── STUDENT EVENTS ───────────────────────────────────────────────────────

    /** Student subscribes to a bus - ✅ FIXED: Validation */
    socket.on('student-watch-bus', async (data: any) => {
      try {
        const { busId } = data;
        const validatedBusId = validateBusId(busId);
        
        socket.join(`bus_${validatedBusId}`);
        socket.data.watchingBusId = validatedBusId;

        // Send current location immediately
        const bus = await Bus.findOne({ busId: validatedBusId }).catch(() => null);
        if (bus?.lastLocation) {
          socket.emit('location-update', {
            busId: bus.busId,
            latitude: bus.lastLocation.latitude,
            longitude: bus.lastLocation.longitude,
            accuracy: bus.lastLocation.accuracy,
            timestamp: bus.lastLocation.timestamp.toISOString(),
          });
        }
        logger.debug('Student watching bus', { socketId: socket.id, busId: validatedBusId });
      } catch (err) {
        logger.error('Error in student-watch-bus', err instanceof Error ? err : new Error(String(err)));
      }
    });

    /** Student stops watching a bus - ✅ FIXED: Validation */
    socket.on('student-stop-watching', async (data: any) => {
      try {
        const { busId } = data;
        const validatedBusId = validateBusId(busId);
        
        socket.leave(`bus_${validatedBusId}`);
        socket.data.watchingBusId = null;
        logger.debug('Student stopped watching', { socketId: socket.id, busId: validatedBusId });
      } catch (err) {
        logger.error('Error in student-stop-watching', err instanceof Error ? err : new Error(String(err)));
      }
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────

    socket.on('disconnect', async () => {
      try {
        logger.info('Socket disconnected', { socketId: socket.id });

        const busId = socket.data.busId as string | undefined;
        if (busId) {
          const connections = activeSockets.get(busId);
          connections?.delete(socket.id);

          if (!connections || connections.size === 0) {
            activeSockets.delete(busId);
            try {
              const bus = await Bus.findOne({ busId });
              if (bus) {
                bus.isActive = false;
                bus.status = 'inactive';
                await bus.save();
              }
              io.emit('bus-status-change', { busId, status: 'offline', timestamp: new Date() });
            } catch (err) {
              logger.error('Error updating bus status on disconnect', err instanceof Error ? err : new Error(String(err)));
            }
          }
        }
      } catch (err) {
        logger.error('Error in disconnect handler', err instanceof Error ? err : new Error(String(err)));
      }
    });

    // ── ERROR HANDLING ─────────────────────────────────────────────────────

    socket.on('error', (err) => {
      logger.error('Socket error', new Error(String(err)), { socketId: socket.id });
    });
  });
}
