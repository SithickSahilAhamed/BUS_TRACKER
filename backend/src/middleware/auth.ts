/**
 * Auth Middleware — Verifies Firebase ID Token
 * Protected routes require a valid Bearer token in the Authorization header
 */
import { Request, Response, NextFunction } from 'express';
import { admin, adminInitialized } from '../config/firebase';
import User from '../models/User';

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const isDev = process.env.NODE_ENV !== 'production';

  // If Firebase Admin is not initialized, only allow in dev mode
  if (!adminInitialized) {
    if (!isDev) {
      res.status(503).json({ success: false, message: 'Auth service not configured' });
      return;
    }
    console.warn('⚠️  Auth skipped: Firebase Admin not initialized (dev only)');
    req.user = { uid: 'dev-user', email: 'dev@local', role: 'admin' };
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'No token provided' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    // Fetch role from MongoDB
    const user = await User.findOne({ firebaseUid: decoded.uid });
    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      role: user?.role || 'driver',
    };
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const requireRole = (role: 'admin' | 'driver') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      res.status(403).json({ success: false, message: `Requires ${role} role` });
      return;
    }
    next();
  };
};
