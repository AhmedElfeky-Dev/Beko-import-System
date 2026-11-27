import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { all, get, run, pool } from '../_lib/db.js';
import { verifyToken, requirePermission } from '../_lib/auth.js';
import { logAction } from '../_lib/auditLog.js';

const router = express.Router();
router.use(verifyToken);

const MASTER_CATEGORIES = new Set(['supplier_name','country_of_origin','carrier','shipping_line','pol','pod','broker','payment_term','incoterm','bank_name','owner','cost_item']);

router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const rows = category
      ? await all('SELECT id, category, value, code FROM master_data WHERE category = $1 ORDER BY value ASC', [category])
      : await all('SELECT id, category, value, code FROM master_data ORDER BY category ASC, value ASC', []);
    res.json(rows);
  } catch (err) {
    console.error('GET /master-data error:', err.message);
    res.status(500).json({ error: 'Failed to load master data' });
  }
});

router.post('/', requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const { category, value, code } = req.body || {};
    if (!MASTER_CATEGORIES.has(category) || !String(value || '').trim())
      return res.status(400).json({ error: 'valid category and value required' });
    const v = String(value).trim();
    const c = (code ?? '').toString().trim() || null;
    const dup = await get('SELECT id FROM master_data WHERE category = $1 AND LOWER(value) = LOWER($2)', [category, v]);
    if (dup) return res.json({ id: dup.id, category, value: v, code: c });
    const id = uuidv4();
    await run('INSERT INTO master_data (id, category, value, code) VALUES ($1, $2, $3, $4)', [id, category, v, c]);
    await logAction(req.user, 'create', 'master_data', id, { category, value: v });
    res.status(201).json({ id, category, value: v, code: c });
  } catch (err) {
    console.error('POST /master-data error:', err.message);
    res.status(500).json({ error: 'Failed to add master data' });
  }
});

router.post('/bulk', requirePermission('settings', 'edit'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { category, values } = req.body || {};
    if (!MASTER_CATEGORIES.has(category) || !Array.isArray(values))
      return res.status(400).json({ error: 'valid category and values[] required' });
    const existing = await all('SELECT LOWER(value) as lv FROM master_data WHERE category = $1', [category]);
    const existingSet = new Set(existing.map(r => r.lv));
    let added = 0;
    await client.query('BEGIN');
    for (const raw of values) {
      const obj = typeof raw === 'string' ? { value: raw, code: null } : raw;
      const v = String(obj?.value ?? '').trim();
      if (!v || existingSet.has(v.toLowerCase())) continue;
      await client.query('INSERT INTO master_data (id, category, value, code) VALUES ($1, $2, $3, $4)',
        [uuidv4(), category, v, (obj.code ?? '').toString().trim() || null]);
      existingSet.add(v.toLowerCase());
      added++;
    }
    await client.query('COMMIT');
    if (added > 0) await logAction(req.user, 'bulk_create', 'master_data', null, { category, added });
    res.json({ added, skipped: values.length - added });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /master-data/bulk error:', err.message);
    res.status(500).json({ error: 'Bulk master data import failed' });
  } finally {
    client.release();
  }
});

router.put('/:id', requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const existing = await get('SELECT id, category, value, code FROM master_data WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (req.body.value !== undefined) {
      const v = String(req.body.value).trim();
      if (!v) return res.status(400).json({ error: 'value cannot be empty' });
      await run('UPDATE master_data SET value = $1, updated_at = NOW() WHERE id = $2', [v, req.params.id]);
    }
    if (req.body.code !== undefined) {
      await run('UPDATE master_data SET code = $1, updated_at = NOW() WHERE id = $2',
        [(req.body.code ?? '').toString().trim() || null, req.params.id]);
    }
    const updated = await get('SELECT id, category, value, code FROM master_data WHERE id = $1', [req.params.id]);
    await logAction(req.user, 'update', 'master_data', req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('PUT /master-data/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update master data' });
  }
});

router.delete('/:id', requirePermission('settings', 'edit'), async (req, res) => {
  try {
    await run('DELETE FROM master_data WHERE id = $1', [req.params.id]);
    await logAction(req.user, 'delete', 'master_data', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /master-data/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete master data' });
  }
});

export default router;
