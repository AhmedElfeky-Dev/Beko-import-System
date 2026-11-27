import express from 'express';
import { all, get, run } from '../_lib/db.js';
import { verifyToken, requirePermission } from '../_lib/auth.js';

const router = express.Router();
router.use(verifyToken);

router.get('/', requirePermission('shipments', 'view'), async (_req, res) => {
  try {
    const rows = await all('SELECT id, data FROM shipments ORDER BY created_at DESC', []);
    res.json(rows.map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', requirePermission('shipments', 'view'), async (req, res) => {
  try {
    const row = await get('SELECT data FROM shipments WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Shipment not found' });
    res.json(typeof row.data === 'string' ? JSON.parse(row.data) : row.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    const shipment = req.body;
    if (!shipment || typeof shipment.id !== 'string' || !shipment.id.trim())
      return res.status(400).json({ error: 'Shipment data with id required' });
    const existing = await get('SELECT id FROM shipments WHERE id = $1', [shipment.id]);
    if (existing) return res.status(409).json({ error: 'Shipment already exists' });
    await run('INSERT INTO shipments (id, data) VALUES ($1, $2)', [shipment.id, JSON.stringify(shipment)]);
    res.status(201).json(shipment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bulk', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    const { shipments } = req.body || {};
    if (!Array.isArray(shipments)) return res.status(400).json({ error: 'shipments array required' });
    let added = 0, skipped = 0;
    for (const s of shipments) {
      if (!s || typeof s.id !== 'string') { skipped++; continue; }
      const ex = await get('SELECT id FROM shipments WHERE id = $1', [s.id]);
      if (ex) { skipped++; continue; }
      await run('INSERT INTO shipments (id, data) VALUES ($1, $2)', [s.id, JSON.stringify(s)]);
      added++;
    }
    res.json({ added, skipped });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    const shipment = { ...req.body, id: req.params.id };
    await run('UPDATE shipments SET data = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(shipment), req.params.id]);
    res.json(shipment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    const row = await get('SELECT data FROM shipments WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Shipment not found' });
    const existing = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const updated = { ...existing, ...req.body, id: req.params.id };
    await run('UPDATE shipments SET data = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updated), req.params.id]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    await run('DELETE FROM shipments WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
