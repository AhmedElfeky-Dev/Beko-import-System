const express = require('express');
const cors = require('cors');
const { initIfNeeded } = require('./_lib/init.cjs');

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

// Initialize DB on first request
app.use(async (_req, _res, next) => {
  try { await initIfNeeded(); } catch (e) { console.error('init error:', e.message); }
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth.cjs'));
app.use('/api/shipments', require('./routes/shipments.cjs'));
app.use('/api/master-data', require('./routes/masterData.cjs'));
app.use('/api/users', require('./routes/users.cjs'));
app.use('/api/settings', require('./routes/settings.cjs'));
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = app;
