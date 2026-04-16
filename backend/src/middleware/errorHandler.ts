/**
 * Global Error Handler Middleware
 */
import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

interface AppError extends Error {
  status?: number;
  code?: number;
}

const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error('Request error', err instanceof Error ? err : new Error(String(err)));

  if (err.name === 'ValidationError') {
    res.status(400).json({ success: false, message: 'Validation Error', error: err.message });
    return;
  }

  if (err.code === 11000) {
    res.status(400).json({ success: false, message: 'Duplicate field value entered' });
    return;
  }

  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({ success: false, message: 'Invalid token' });
    return;
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export default errorHandler;
