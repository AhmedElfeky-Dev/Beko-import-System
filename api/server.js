import express from 'express';
import cors from 'cors';
import { initIfNeeded } from './_lib/init.js';
import authRoutes from './routes/auth.js';
import shipmentsRoutes from './routes/shipments.js';
import masterDataRoutes from './routes/masterData.js';
import usersRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'https://beko-import-system.vercel.app')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(async (_req, res, next) => {
  try { await initIfNeeded(); } catch (e) {
    console.error('init error:', e.message);
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/shipments', shipmentsRoutes);
app.use('/api/master-data', masterDataRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/settings', settingsRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

export default app;
