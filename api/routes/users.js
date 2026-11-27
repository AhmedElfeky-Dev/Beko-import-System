import express from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run } from '../_lib/db.js';
import { verifyToken, requireAdmin } from '../_lib/auth.js';

const router = express.Router();
router.use(verifyToken);

const PAGES = ['dashboard', 'shipments', 'costs', 'settings'];

// Convert boolean columns → level string ('none'|'view'|'edit')
function boolsToLevel(p) {
  if (p.can_edit || p.can_delete) return 'edit';
  if (p.can_view) return 'view';
  return 'none';
}

// Convert level string → boolean columns
function levelToBools(level) {
  return {
    can_view: level === 'view' || level === 'edit',
    can_edit: level === 'edit',
    can_delete: level === 'edit',
  };
}

// Build permissions map {page: level} for a user
async function getPermsMap(userId) {
  const perms = await all(
    'SELECT page, can_view, can_edit, can_delete FROM page_permissions WHERE user_id = $1',
    [userId]
  );
  const result = { dashboard: 'none', shipments: 'none', costs: 'none', settings: 'none' };
  for (const p of perms) result[p.page] = boolsToLevel(p);
  return result;
}

// GET /api/users — list all users WITH their permissions
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const users = await all(
      `SELECT u.id, u.email, u.name,
              COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
       GROUP BY u.id ORDER BY u.created_at DESC`,
      []
    );
    // Attach permissions to each user
    const result = await Promise.all(
      users.map(async (u) => ({
        ...u,
        display_name: u.name,
        permissions: await getPermsMap(u.id),
      }))
    );
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users — create user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { email, name, display_name, password, roles = [], permissions = {} } = req.body;
    const displayName = name || display_name || '';
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const existing = await get('SELECT id FROM users WHERE LOWER(email) = $1', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const id = uuidv4();
    const hashed = await bcrypt.hash(password, 12);
    await run('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)',
      [id, email, displayName, hashed]);

    // Roles
    for (const role of roles) {
      await run('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, role]);
    }

    // Permissions — use provided levels or default 'none'
    for (const page of PAGES) {
      const level = permissions[page] || 'none';
      const { can_view, can_edit, can_delete } = levelToBools(level);
      await run(
        `INSERT INTO page_permissions (user_id, page, can_view, can_edit, can_delete)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [id, page, can_view, can_edit, can_delete]
      );
    }

    const perms = await getPermsMap(id);
    const user = await get(
      `SELECT u.id, u.email, u.name,
              COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.id = $1 GROUP BY u.id`,
      [id]
    );
    res.status(201).json({ ...user, display_name: user.name, permissions: perms });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id — update user info / password
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, display_name, password, roles } = req.body;
    const displayName = name || display_name;
    if (!(await get('SELECT id FROM users WHERE id = $1', [id])))
      return res.status(404).json({ error: 'User not found' });

    if (email || displayName !== undefined) {
      await run(
        'UPDATE users SET email = COALESCE($1, email), name = COALESCE($2, name), updated_at = NOW() WHERE id = $3',
        [email || null, displayName !== undefined ? displayName : null, id]
      );
    }
    if (password) {
      await run('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [await bcrypt.hash(password, 12), id]);
    }
    if (Array.isArray(roles)) {
      await run('DELETE FROM user_roles WHERE user_id = $1', [id]);
      for (const role of roles) {
        await run('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, role]);
      }
    }

    const perms = await getPermsMap(id);
    const user = await get(
      `SELECT u.id, u.email, u.name,
              COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.id = $1 GROUP BY u.id`,
      [id]
    );
    res.json({ ...user, display_name: user.name, permissions: perms });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/users/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    if (!(await get('SELECT id FROM users WHERE id = $1', [id])))
      return res.status(404).json({ error: 'User not found' });
    await run('DELETE FROM page_permissions WHERE user_id = $1', [id]);
    await run('DELETE FROM user_roles WHERE user_id = $1', [id]);
    await run('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/users/:id/permissions — returns {page: 'none'|'view'|'edit'}
router.get('/:id/permissions', requireAdmin, async (req, res) => {
  try {
    res.json(await getPermsMap(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id/permissions — accepts {page: 'none'|'view'|'edit'}
router.put('/:id/permissions', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    for (const [page, level] of Object.entries(req.body)) {
      const { can_view, can_edit, can_delete } = levelToBools(String(level));
      await run(
        `INSERT INTO page_permissions (user_id, page, can_view, can_edit, can_delete)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, page) DO UPDATE
         SET can_view = EXCLUDED.can_view,
             can_edit = EXCLUDED.can_edit,
             can_delete = EXCLUDED.can_delete`,
        [id, page, can_view, can_edit, can_delete]
      );
    }
    res.json(await getPermsMap(id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id/roles
router.put('/:id/roles', requireAdmin, async (req, res) => {
  try {
    const { roles = [] } = req.body;
    await run('DELETE FROM user_roles WHERE user_id = $1', [req.params.id]);
    for (const role of roles) {
      await run('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.id, role]);
    }
    const updatedRoles = await all('SELECT role FROM user_roles WHERE user_id = $1', [req.params.id]);
    res.json({ roles: updatedRoles.map(r => r.role) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
