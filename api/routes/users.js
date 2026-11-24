const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../_lib/db');
const { verifyToken, requireAdmin } = require('../_lib/auth');

const router = express.Router();
router.use(verifyToken);

const PAGES = ['dashboard', 'shipments', 'costs', 'settings'];

// GET /api/users — list all users
router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await all(
      `SELECT u.id, u.email, u.name, u.created_at,
              COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
      []
    );
    res.json(users);
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// POST /api/users — create user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { email, name, password, roles = [] } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const existing = await get('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const id = uuidv4();
    const hashed = await bcrypt.hash(password, 12);
    await run(
      'INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)',
      [id, email, name || '', hashed]
    );

    // Assign roles
    for (const role of roles) {
      await run(
        'INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, role]
      );
    }

    // Default permissions (all false)
    for (const page of PAGES) {
      await run(
        `INSERT INTO page_permissions (user_id, page, can_view, can_edit, can_delete)
         VALUES ($1, $2, false, false, false)
         ON CONFLICT (user_id, page) DO NOTHING`,
        [id, page]
      );
    }

    const user = await get(
      `SELECT u.id, u.email, u.name, u.created_at,
              COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [id]
    );
    res.status(201).json(user);
  } catch (err) {
    console.error('POST /users error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id — update user info / password
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, password, roles } = req.body;

    const existing = await get('SELECT id FROM users WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (email || name !== undefined) {
      await run(
        'UPDATE users SET email = COALESCE($1, email), name = COALESCE($2, name), updated_at = NOW() WHERE id = $3',
        [email || null, name !== undefined ? name : null, id]
      );
    }

    if (password) {
      const hashed = await bcrypt.hash(password, 12);
      await run('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashed, id]);
    }

    // Update roles if provided
    if (Array.isArray(roles)) {
      await run('DELETE FROM user_roles WHERE user_id = $1', [id]);
      for (const role of roles) {
        await run(
          'INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, role]
        );
      }
    }

    const user = await get(
      `SELECT u.id, u.email, u.name, u.created_at,
              COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [id]
    );
    res.json(user);
  } catch (err) {
    console.error('PUT /users/:id error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id — delete user (admin only, cannot delete self)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const existing = await get('SELECT id FROM users WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    await run('DELETE FROM page_permissions WHERE user_id = $1', [id]);
    await run('DELETE FROM user_roles WHERE user_id = $1', [id]);
    await run('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /users/:id error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/users/:id/permissions — get user page permissions
router.get('/:id/permissions', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const perms = await all(
      'SELECT page, can_view, can_edit, can_delete FROM page_permissions WHERE user_id = $1',
      [id]
    );
    // Return as object keyed by page
    const result = {};
    for (const p of perms) {
      result[p.page] = { can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete };
    }
    res.json(result);
  } catch (err) {
    console.error('GET /users/:id/permissions error:', err);
    res.status(500).json({ error: 'Failed to load permissions' });
  }
});

// PUT /api/users/:id/permissions — update user page permissions
router.put('/:id/permissions', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const permissions = req.body; // { dashboard: { can_view, can_edit, can_delete }, ... }

    for (const [page, perms] of Object.entries(permissions)) {
      await run(
        `INSERT INTO page_permissions (user_id, page, can_view, can_edit, can_delete)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, page) DO UPDATE
         SET can_view = EXCLUDED.can_view,
             can_edit = EXCLUDED.can_edit,
             can_delete = EXCLUDED.can_delete`,
        [id, page, perms.can_view || false, perms.can_edit || false, perms.can_delete || false]
      );
    }

    const perms = await all(
      'SELECT page, can_view, can_edit, can_delete FROM page_permissions WHERE user_id = $1',
      [id]
    );
    const result = {};
    for (const p of perms) {
      result[p.page] = { can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete };
    }
    res.json(result);
  } catch (err) {
    console.error('PUT /users/:id/permissions error:', err);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// PUT /api/users/:id/roles — update user roles
router.put('/:id/roles', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { roles = [] } = req.body;

    await run('DELETE FROM user_roles WHERE user_id = $1', [id]);
    for (const role of roles) {
      await run(
        'INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, role]
      );
    }

    const updatedRoles = await all('SELECT role FROM user_roles WHERE user_id = $1', [id]);
    res.json({ roles: updatedRoles.map((r) => r.role) });
  } catch (err) {
    console.error('PUT /users/:id/roles error:', err);
    res.status(500).json({ error: 'Failed to update roles' });
  }
});

module.exports = router;
