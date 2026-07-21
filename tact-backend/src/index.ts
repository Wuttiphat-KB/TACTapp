// C:\Users\Asus\Documents\TACT\tact-backend\src\index.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/database';
import { authRoutes, stationRoutes, chargingRoutes, telemetryRoutes } from './routes';
import { initCSMSListener } from './services/csmsListener';
import { initGeneratorState } from './services/generatorState';

// Load environment variables
dotenv.config();

// Create Express app
const app: Application = express();

// Create HTTP server
const httpServer = createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging (development)
if (process.env.NODE_ENV === 'development') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/charging', chargingRoutes);
app.use('/api/telemetry', telemetryRoutes);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'TACT API is running',
    timestamp: new Date().toISOString(),
    socketIO: io.engine.clientsCount,
  });
});

// Root route
app.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Welcome to TACT EV Charger API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      stations: '/api/stations',
      charging: '/api/charging',
      health: '/api/health',
    },
    socketIO: {
      connected: io.engine.clientsCount,
    },
  });
});

// ========== Socket.IO Events ==========
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // รับ userId จาก auth handshake
  const userId = socket.handshake.auth?.userId;
  if (userId) {
    socket.join(`user:${userId}`);
    console.log(`   User ${userId} joined room`);
  }

  // Join session room (สำหรับรับ meterUpdate)
  socket.on('joinSession', (sessionId: string) => {
    socket.join(`session:${sessionId}`);
    console.log(`   Socket ${socket.id} joined session:${sessionId}`);
  });

  // Leave session room
  socket.on('leaveSession', (sessionId: string) => {
    socket.leave(`session:${sessionId}`);
    console.log(`   Socket ${socket.id} left session:${sessionId}`);
  });

  // Ping/Pong for connection testing
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback({ pong: true, timestamp: Date.now() });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);
  });
});

// Make io available globally for other modules
export { io };

// ========== Initialize CSMS Listener ==========
initCSMSListener(io);

// ========== Initialize Generator telemetry (staleness watchdog + socket) ==========
initGeneratorState(io);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║       TACT EV Charger API Server                  ║
╠═══════════════════════════════════════════════════╣
║  🚀 Server running on port ${PORT}                   ║
║  📦 Environment: ${process.env.NODE_ENV || 'development'}                  ║
║  🔗 http://localhost:${PORT}                         ║
║  🔌 Socket.IO enabled                             ║
║  ⚡ CSMS: ${process.env.CSMS_HTTP_URL || 'http://212.80.215.42:8080'}     ║
╚═══════════════════════════════════════════════════╝
  `);
});

export default app;