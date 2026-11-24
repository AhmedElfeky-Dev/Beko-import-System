const express = require('express');
const { all, get, run } = require('../_lib/db');
const { verifyToken, requirePermission } = require('../_lib/auth');

const router = express.Router();
router.use(verifyToken);

// GET /api/shipments
router.get('/', requirePermission('shipments', 'view'), async (_req, res) => {
  try {
    const rows = await all('SELECT id, data FROM shipments ORDER BY created_at DESC', []);
    res.json(rows.map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/shipments/:id
router.get('/:id', requirePermission('shipments', 'view'), async (req, res) => {
  try {
    const row = await get('SELECT data FROM shipments WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Shipment not found' });
    res.json(typeof row.data === 'string' ? JSON.parse(row.data) : row.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shipments
router.post('/', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    const shipment = req.body;
    if (!shipment || typeof shipment.id !== 'string' || !shipment.id.trim())
      return res.status(400).json({ error: 'Shipment data with id required' });
    const existing = await get('SELECT id FROM shipments WHERE id = ?', [shipment.id]);
    if (existing) return res.status(409).json({ error: 'Shipment already exists' });
    await run('INSERT INTO shipments (id, data) VALUES (?, ?)', [shipment.id, JSON.stringify(shipment)]);
    res.status(201).json(shipment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shipments/bulk
router.post('/bulk', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    const { shipments } = req.body || {};
    if (!Array.isArray(shipments)) return res.status(400).json({ error: 'shipments array required' });
    let added = 0, skipped = 0;
    for (const s of shipments) {
      if (!s || typeof s.id !== 'string') { skipped++; continue; }
      const ex = await get('SELECT id FROM shipments WHERE id = ?', [s.id]);
      if (ex) { skipped++; continue; }
      await run('INSERT INTO shipments (id, data) VALUES (?, ?)', [s.id, JSON.stringify(s)]);
      added++;
    }
    res.json({ added, skipped });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/shipments/:id
router.put('/:id', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    const shipment = { ...req.body, id: req.params.id };
    await run("UPDATE shipments SET data = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(shipment), req.params.id]);
    res.json(shipment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/shipments/:id
router.patch('/:id', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    const row = await get('SELECT data FROM shipments WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Shipment not found' });
    const existing = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const updated = { ...existing, ...req.body, id: req.params.id };
    await run("UPDATE shipments SET data = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(updated), req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/shipments/:id
router.delete('/:id', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    await run('DELETE FROM shipments WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
