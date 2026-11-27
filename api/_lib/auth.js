import jwt from 'jsonwebtoken';
import { get, all } from './db.js';

if (process.env.VERCEL && !process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set in production');
}
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-not-for-production';

/**
 * Load live roles & permissions from DB for a user id.
 * Returns null if the user no longer exists (deleted).
 */
async function loadLiveUser(userId) {
  const user = await get('SELECT id, email, name FROM users WHERE id = $1', [userId]);
  if (!user) return null;
  const roles = await all('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  const isAdmin = roles.some(r => r.role === 'admin');
  const perms = await all(
    'SELECT page, can_view, can_edit, can_delete FROM page_permissions WHERE user_id = $1',
    [userId]
  );
  const permissions = { dashboard: 'none', shipments: 'none', costs: 'none', settings: 'none' };
  perms.forEach(p => {
    if (p.can_edit || p.can_delete) permissions[p.page] = 'edit';
    else if (p.can_view) permissions[p.page] = 'view';
    else permissions[p.page] = 'none';
  });
  if (isAdmin) Object.keys(permissions).forEach(k => { permissions[k] = 'edit'; });
  return { id: user.id, email: user.email, displayName: user.name || user.email, isAdmin, permissions };
}

export function verifyToken(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Load live permissions from DB (not stale JWT claims)
    loadLiveUser(decoded.id)
      .then(liveUser => {
        if (!liveUser) return res.status(401).json({ error: 'User no longer exists' });
        req.user = liveUser;
        next();
      })
      .catch(err => {
        console.error('Live permission load error:', err.message);
        // Fallback to JWT claims if DB is temporarily unreachable
        req.user = decoded;
        next();
      });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

const LEVELS = ['none', 'view', 'edit'];

export function hasPermission(user, page, minLevel) {
  if (user?.isAdmin) return true;
  const minIdx = LEVELS.indexOf(minLevel);
  const userLevel = user?.permissions?.[page] || 'none';
  return LEVELS.indexOf(userLevel) >= minIdx;
}

export function requirePermission(page, minLevel) {
  return (req, res, next) => {
    if (!hasPermission(req.user, page, minLevel))
      return res.status(403).json({ error: `${page} ${minLevel} access required` });
    next();
  };
}

export function requireAnyPermission(checks) {
  return (req, res, next) => {
    if (checks.some(([page, minLevel]) => hasPermission(req.user, page, minLevel))) {
      return next();
    }
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}
