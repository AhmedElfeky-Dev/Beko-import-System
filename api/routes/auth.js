import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { all, get } from '../_lib/db.js';
import { verifyToken, JWT_SECRET } from '../_lib/auth.js';
import { logAction } from '../_lib/auditLog.js';

const router = express.Router();

// ── Rate limiting (in-memory per serverless instance) ──
const loginAttempts = new Map(); // key=ip, value={count, firstAttempt}
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 15; // per window

function checkRateLimit(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }
  entry.count++;
  if (entry.count > MAX_ATTEMPTS) return false;
  return true;
}

async function buildUserPayload(userId) {
  const user = await get('SELECT id, email, name FROM users WHERE id = $1', [userId]);
  if (!user) return null;
  const roles = await all('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  const isAdmin = roles.some(r => r.role === 'admin');
  const perms = await all('SELECT page, can_view, can_edit, can_delete FROM page_permissions WHERE user_id = $1', [userId]);
  const permissions = { dashboard: 'none', shipments: 'none', costs: 'none', settings: 'none' };
  perms.forEach(p => {
    if (p.can_edit || p.can_delete) permissions[p.page] = 'edit';
    else if (p.can_view) permissions[p.page] = 'view';
    else permissions[p.page] = 'none';
  });
  if (isAdmin) Object.keys(permissions).forEach(k => { permissions[k] = 'edit'; });
  return { id: user.id, email: user.email, displayName: user.name || user.email, isAdmin, permissions };
}

router.post('/login', async (req, res) => {
  try {
    if (!checkRateLimit(req)) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    }
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await get('SELECT * FROM users WHERE LOWER(email) = $1', [String(email).trim().toLowerCase()]);
    if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
      await logAction({ id: null, email: String(email).trim() }, 'login_failed', 'auth', null);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const payload = await buildUserPayload(user.id);
    // JWT contains only id for authentication; live permissions are loaded per-request
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '24h' });
    await logAction(payload, 'login', 'auth', user.id);
    res.json({ token, user: payload });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

router.post('/logout', (_req, res) => res.json({ ok: true }));

router.get('/me', verifyToken, async (req, res) => {
  try {
    const payload = await buildUserPayload(req.user.id);
    if (!payload) return res.status(404).json({ error: 'User not found' });
    res.json(payload);
  } catch (err) {
    console.error('GET /me error:', err.message);
    res.status(500).json({ error: 'Failed to load user profile' });
  }
});

export default router;
