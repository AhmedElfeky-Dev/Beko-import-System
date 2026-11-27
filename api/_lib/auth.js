import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

export function verifyToken(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

export function requirePermission(page, minLevel) {
  const LEVELS = ['none', 'view', 'edit'];
  const minIdx = LEVELS.indexOf(minLevel);
  return (req, res, next) => {
    if (req.user?.isAdmin) return next();
    const userLevel = req.user?.permissions?.[page] || 'none';
    if (LEVELS.indexOf(userLevel) < minIdx)
      return res.status(403).json({ error: `${page} ${minLevel} access required` });
    next();
  };
}
