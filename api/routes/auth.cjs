const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { all, get } = require('../_lib/db.cjs');
const { verifyToken, JWT_SECRET } = require('../_lib/auth.cjs');

const router = express.Router();

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
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await get('SELECT * FROM users WHERE LOWER(email) = $1', [String(email).trim().toLowerCase()]);
    if (!user || !(await bcrypt.compare(String(password), user.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password' });
    const payload = await buildUserPayload(user.id);
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: payload });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (_req, res) => res.json({ ok: true }));

router.get('/me', verifyToken, async (req, res) => {
  try {
    const payload = await buildUserPayload(req.user.id);
    if (!payload) return res.status(404).json({ error: 'User not found' });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
