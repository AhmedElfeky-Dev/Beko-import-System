const express = require('express');
const cors = require('cors');
const { initIfNeeded } = require('./_lib/init');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'https://beko-import-system.vercel.app')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Seed DB on first request
app.use(async (_req, _res, next) => {
  await initIfNeeded();
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/shipments', require('./routes/shipments'));
app.use('/api/master-data', require('./routes/masterData'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = app;
