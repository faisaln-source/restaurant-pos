import 'dotenv/config';
import 'express-async-errors';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { loadSidecarConfig } from './lib/sidecar-config';

// Load sidecar config BEFORE anything that reads env vars (Prisma, JWT, etc.)
loadSidecarConfig();

import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { requestLogger } from './middleware/requestLogger';

// Routes
import authRoutes from './routes/auth.routes';
import menuRoutes from './routes/menu.routes';
import tableRoutes from './routes/table.routes';
import orderRoutes from './routes/order.routes';
import paymentRoutes from './routes/payment.routes';
import staffRoutes from './routes/staff.routes';
import reportRoutes from './routes/report.routes';
import kioskRoutes from './routes/kiosk.routes';
import sectionChargeRoutes from './routes/section-charge.routes';
import kitchenStationRoutes from './routes/kitchen-station.routes';


import { registerSocketHandlers } from './sockets';
import bcrypt from 'bcryptjs';
import prisma from './lib/prisma';

const app = express();
const httpServer = createServer(app);

// ── CORS Configuration ───────────────────────────────────────────────────
const rawCorsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
const allowedOrigins = rawCorsOrigin
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const isOriginAllowed = (origin?: string): boolean => {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  const clean = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(clean) || allowedOrigins.includes('*')) return true;
  if (/^https:\/\/.*\.vercel\.app$/.test(clean)) return true;
  if (/^https:\/\/.*\.trycloudflare\.com$/.test(clean)) return true;
  if (/^https:\/\/.*\.loca\.lt$/.test(clean)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(clean)) return true;
  // Allow Tauri desktop webview origins (Windows uses http://tauri.localhost, macOS/Linux use tauri://localhost)
  if (clean === 'tauri://localhost' || clean === 'https://tauri.localhost' || clean === 'http://tauri.localhost') return true;
  if (clean.includes('tauri.localhost') || clean.startsWith('tauri://')) return true;
  return false;
};

// ── Socket.IO ──────────────────────────────────────────────────────────────
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Socket CORS blocked origin: ${origin}`));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

registerSocketHandlers(io);

// Make io accessible from route handlers via req.app.get('io')
app.set('io', io);

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked origin: ${origin}`));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use(cookieParser());
app.use(requestLogger);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/kiosk', kioskRoutes);
app.use('/api/section-charges', sectionChargeRoutes);
app.use('/api/kitchen-stations', kitchenStationRoutes);


// ── Error Handlers ─────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

async function ensureInitialUsers() {
  try {
    const defaultUsers = [
      { email: 'admin@restaurant.com', name: 'Admin User', role: 'ADMIN', pass: 'admin123', pin: '0000' },
      { email: 'cashier@restaurant.com', name: 'Cashier User', role: 'CASHIER', pass: 'cashier123', pin: '1234' },
      { email: 'waiter@restaurant.com', name: 'Waiter User', role: 'WAITER', pass: 'waiter123', pin: '9999' },
      { email: 'kitchen@restaurant.com', name: 'Kitchen Staff', role: 'KITCHEN', pass: 'kitchen123', pin: '5678' },
    ];

    for (const u of defaultUsers) {
      const exists = await prisma.user.findUnique({ where: { email: u.email } });
      if (!exists) {
        console.log(`🌱 Creating default user ${u.name} (${u.role})...`);
        const passwordHash = await bcrypt.hash(u.pass, 12);
        const pinHash = await bcrypt.hash(u.pin, 12);
        await prisma.user.create({
          data: {
            name: u.name,
            email: u.email,
            passwordHash,
            pin: pinHash,
            role: u.role as any,
          },
        });
      }
    }
    console.log('✅ Default staff accounts verified');
  } catch (err) {
    console.warn('⚠️ Could not verify initial users:', err);
  }
}

// ── Start server ───────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4000;

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, async () => {
    console.log(`\n🍽️  Restaurant POS API`);
    console.log(`✅  Server running on http://localhost:${PORT}`);
    console.log(`📡  Socket.IO ready`);
    console.log(`🌿  Environment: ${process.env.NODE_ENV}\n`);
    await ensureInitialUsers();
  });
}

export { app, httpServer };
