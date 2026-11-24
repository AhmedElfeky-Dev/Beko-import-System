const express = require('express');
const { all, get, run } = require('../_lib/db');
const { verifyToken, requirePermission } = require('../_lib/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
router.use(verifyToken);

const MASTER_CATEGORIES = new Set(['supplier_name','country_of_origin','carrier','shipping_line','pol','pod','broker','payment_term','incoterm','bank_name','owner','cost_item']);

router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const rows = category
      ? await all('SELECT id, category, value, code FROM master_data WHERE category = ? ORDER BY value ASC', [category])
      : await all('SELECT id, category, value, code FROM master_data ORDER BY value ASC', []);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const { category, value, code } = req.body || {};
    if (!MASTER_CATEGORIES.has(category) || !String(value || '').trim())
      return res.status(400).json({ error: 'valid category and value required' });
    const v = String(value).trim();
    const c = (code ?? '').toString().trim() || null;
    const dup = await get('SELECT id FROM master_data WHERE category = ? AND LOWER(value) = LOWER(?)', [category, v]);
    if (dup) return res.json({ id: dup.id, category, value: v, code: c });
    const id = uuidv4();
    await run('INSERT INTO master_data (id, category, value, code) VALUES (?, ?, ?, ?)', [id, category, v, c]);
    res.status(201).json({ id, category, value: v, code: c });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bulk', requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const { category, values } = req.body || {};
    if (!MASTER_CATEGORIES.has(category) || !Array.isArray(values))
      return res.status(400).json({ error: 'valid category and values[] required' });
    const existing = await all('SELECT LOWER(value) as lv FROM master_data WHERE category = ?', [category]);
    const existingSet = new Set(existing.map(r => r.lv));
    let added = 0;
    for (const raw of values) {
      const obj = typeof raw === 'string' ? { value: raw, code: null } : raw;
      const v = String(obj?.value ?? '').trim();
      if (!v || existingSet.has(v.toLowerCase())) continue;
      await run('INSERT INTO master_data (id, category, value, code) VALUES (?, ?, ?, ?)',
        [uuidv4(), category, v, (obj.code ?? '').toString().trim() || null]);
      existingSet.add(v.toLowerCase());
      added++;
    }
    res.json({ added, skipped: values.length - added });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', requirePermission('settings', 'edit'), async (req, res) => {
  try {
    const existing = await get('SELECT id, category, value, code FROM master_data WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (req.body.value !== undefined) {
      const v = String(req.body.value).trim();
      if (!v) return res.status(400).json({ error: 'value cannot be empty' });
      await run("UPDATE master_data SET value = ?, updated_at = datetime('now') WHERE id = ?", [v, req.params.id]);
    }
    if (req.body.code !== undefined) {
      await run("UPDATE master_data SET code = ?, updated_at = datetime('now') WHERE id = ?",
        [(req.body.code ?? '').toString().trim() || null, req.params.id]);
    }
    const updated = await get('SELECT id, category, value, code FROM master_data WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', requirePermission('settings', 'edit'), async (req, res) => {
  try {
    await run('DELETE FROM master_data WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
