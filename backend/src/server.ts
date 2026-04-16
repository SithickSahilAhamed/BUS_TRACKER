/**
 * ============================================
 * COLLEGE BUS TRACKING SYSTEM — BACKEND v2
 * TypeScript + Express + Socket.IO + MongoDB
 * + Firebase Admin SDK
 * ============================================
 */
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

dotenv.config();

import connectDB from './config/db';
import './config/firebase'; // initialize Firebase Admin
import apiRoutes from './routes/api';
import errorHandler from './middleware/errorHandler';
import { registerSocketEvents } from './socket/events';
import logger from './lib/logger';

import path from 'path';

// ── SECURITY: Setup global error handlers FIRST ─────────────────────────────
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  logger.fatal('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('Unhandled Rejection', new Error(String(reason)));
  process.exit(1);
});

// ── APP SETUP ──────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Serve React build only in production to avoid legacy static pages in dev
const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
  const clientDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(clientDist));
}

const io = new SocketIOServer(server, {
  cors: {
    origin: (process.env.CLIENT_ORIGIN || 'http://localhost:3000').split(','),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ── SECURITY: Rate Limiting ────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 API calls per minute
});

// ── SECURITY: CORS Whitelist ──────────────────────────────────────────────
const corsOptions = {
  origin: (process.env.CLIENT_ORIGIN || 'http://localhost:3000').split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ── MIDDLEWARE ─────────────────────────────────────────────────────────────
app.use(limiter); // Global rate limiting
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── HEALTH CHECK ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    uptime: process.uptime(),
  });
});

// ── DATABASE ───────────────────────────────────────────────────────────────
connectDB();

// ── ROUTES ─────────────────────────────────────────────────────────────────
app.use('/api', apiLimiter, apiRoutes);

if (isProd) {
  const clientDist = path.join(__dirname, '../../frontend/dist');
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── SOCKET.IO ──────────────────────────────────────────────────────────────
registerSocketEvents(io);

// ── ERROR HANDLING ─────────────────────────────────────────────────────────
app.use(errorHandler);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── START ──────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '5000', 10);
server.listen(PORT, () => {
  logger.info('✅ Server running', {
    url: `http://localhost:${PORT}`,
    env: process.env.NODE_ENV,
    port: PORT,
  });
  logger.info('📡 WebSocket server ready');
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.warn('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default server;
