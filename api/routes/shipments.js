import express from 'express';
import { all, get, run, pool } from '../_lib/db.js';
import { verifyToken, requirePermission, requireAnyPermission, hasPermission } from '../_lib/auth.js';
import { logAction } from '../_lib/auditLog.js';

const router = express.Router();
router.use(verifyToken);

// Helper: parse JSONB data safely
function parseData(row) {
  return typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
}

const COST_FIELDS = new Set(['costs', 'exchangeRateUSD', 'exchangeRateEUR', 'baseCurrency', 'f4CommissionRate']);

// GET /api/shipments — list all (accessible with shipments:view OR costs:view)
router.get('/', requireAnyPermission([['shipments', 'view'], ['costs', 'view']]), async (_req, res) => {
  try {
    const rows = await all('SELECT id, data, version FROM shipments ORDER BY created_at DESC', []);
    res.json(rows.map(r => ({ ...parseData(r), _version: r.version })));
  } catch (err) {
    console.error('GET /shipments error:', err.message);
    res.status(500).json({ error: 'Failed to load shipments' });
  }
});

// GET /api/shipments/:id — single shipment (accessible with shipments:view OR costs:view)
router.get('/:id', requireAnyPermission([['shipments', 'view'], ['costs', 'view']]), async (req, res) => {
  try {
    const row = await get('SELECT data, version FROM shipments WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Shipment not found' });
    res.json({ ...parseData(row), _version: row.version });
  } catch (err) {
    console.error('GET /shipments/:id error:', err.message);
    res.status(500).json({ error: 'Failed to load shipment' });
  }
});

// POST /api/shipments — create (requires shipments:edit)
router.post('/', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    const shipment = req.body;
    if (!shipment || typeof shipment.id !== 'string' || !shipment.id.trim())
      return res.status(400).json({ error: 'Shipment data with id required' });
    const existing = await get('SELECT id FROM shipments WHERE id = $1', [shipment.id]);
    if (existing) return res.status(409).json({ error: 'Shipment already exists' });
    // Strip _version from stored data
    const { _version, ...cleanData } = shipment;
    await run('INSERT INTO shipments (id, data, version) VALUES ($1, $2, 1)', [shipment.id, JSON.stringify(cleanData)]);
    await logAction(req.user, 'create', 'shipment', shipment.id);
    res.status(201).json({ ...cleanData, _version: 1 });
  } catch (err) {
    console.error('POST /shipments error:', err.message);
    res.status(500).json({ error: 'Failed to create shipment' });
  }
});

// POST /api/shipments/bulk — bulk create (in a transaction)
router.post('/bulk', requirePermission('shipments', 'edit'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { shipments } = req.body || {};
    if (!Array.isArray(shipments)) return res.status(400).json({ error: 'shipments array required' });
    let added = 0, skipped = 0;
    await client.query('BEGIN');
    for (const s of shipments) {
      if (!s || typeof s.id !== 'string') { skipped++; continue; }
      const ex = await client.query('SELECT id FROM shipments WHERE id = $1', [s.id]);
      if (ex.rows.length > 0) { skipped++; continue; }
      const { _version, ...cleanData } = s;
      await client.query('INSERT INTO shipments (id, data, version) VALUES ($1, $2, 1)', [s.id, JSON.stringify(cleanData)]);
      added++;
    }
    await client.query('COMMIT');
    if (added > 0) await logAction(req.user, 'bulk_create', 'shipment', null, { added, skipped });
    res.json({ added, skipped });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /shipments/bulk error:', err.message);
    res.status(500).json({ error: 'Bulk import failed' });
  } finally {
    client.release();
  }
});

// PUT /api/shipments/:id — full update with optimistic locking + shipments/costs permission split
router.put('/:id', requireAnyPermission([['shipments', 'edit'], ['costs', 'edit']]), async (req, res) => {
  try {
    const { _version, ...shipmentData } = { ...req.body, id: req.params.id };
    const currentVersion = typeof _version === 'number' ? _version : null;

    const existing = await get('SELECT data, version FROM shipments WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Shipment not found' });

    if (currentVersion !== null && currentVersion !== existing.version) {
      return res.status(409).json({
        error: 'This shipment was modified by another user. Please refresh and try again.',
        currentVersion: existing.version,
      });
    }

    const existingData = parseData(existing);
    const canEditShipments = hasPermission(req.user, 'shipments', 'edit');
    const canEditCosts = hasPermission(req.user, 'costs', 'edit');

    let finalData;
    if (canEditShipments && canEditCosts) {
      finalData = shipmentData;
    } else if (canEditShipments) {
      // User can edit shipment fields, but not costs — preserve existing costs
      finalData = { ...shipmentData, costs: existingData.costs ?? [] };
    } else {
      // User can edit costs only — only apply cost-related fields
      finalData = { ...existingData };
      for (const field of COST_FIELDS) {
        if (field in shipmentData) finalData[field] = shipmentData[field];
      }
    }

    const newVersion = existing.version + 1;
    const result = await get(
      `UPDATE shipments SET data = $1, version = $2, updated_at = NOW()
       WHERE id = $3 AND version = $4
       RETURNING version`,
      [JSON.stringify(finalData), newVersion, req.params.id, existing.version]
    );

    if (!result) {
      return res.status(409).json({
        error: 'This shipment was modified by another user. Please refresh and try again.',
      });
    }

    await logAction(req.user, 'update', 'shipment', req.params.id);
    res.json({ ...finalData, _version: newVersion });
  } catch (err) {
    console.error('PUT /shipments/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update shipment' });
  }
});

// PATCH /api/shipments/:id — partial update with optimistic locking + permission enforcement
router.patch('/:id', requireAnyPermission([['shipments', 'edit'], ['costs', 'edit']]), async (req, res) => {
  try {
    const { _version, ...patchData } = req.body;

    const row = await get('SELECT data, version FROM shipments WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Shipment not found' });

    if (typeof _version === 'number' && _version !== row.version) {
      return res.status(409).json({
        error: 'This shipment was modified by another user. Please refresh and try again.',
        currentVersion: row.version,
      });
    }

    const canEditShipments = hasPermission(req.user, 'shipments', 'edit');
    const canEditCosts = hasPermission(req.user, 'costs', 'edit');

    const filteredPatch = {};
    for (const [k, v] of Object.entries(patchData)) {
      if (COST_FIELDS.has(k)) {
        if (canEditCosts) filteredPatch[k] = v;
      } else {
        if (canEditShipments) filteredPatch[k] = v;
      }
    }

    const existing = parseData(row);
    const updated = { ...existing, ...filteredPatch, id: req.params.id };
    const newVersion = row.version + 1;

    const result = await get(
      `UPDATE shipments SET data = $1, version = $2, updated_at = NOW()
       WHERE id = $3 AND version = $4
       RETURNING version`,
      [JSON.stringify(updated), newVersion, req.params.id, row.version]
    );

    if (!result) {
      return res.status(409).json({
        error: 'This shipment was modified by another user. Please refresh and try again.',
      });
    }

    await logAction(req.user, 'patch', 'shipment', req.params.id, { fields: Object.keys(filteredPatch) });
    res.json({ ...updated, _version: newVersion });
  } catch (err) {
    console.error('PATCH /shipments/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update shipment' });
  }
});

// DELETE /api/shipments/:id — requires shipments:edit + can_delete
router.delete('/:id', requirePermission('shipments', 'edit'), async (req, res) => {
  try {
    const existing = await get('SELECT id FROM shipments WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Shipment not found' });

    await run('DELETE FROM shipments WHERE id = $1', [req.params.id]);
    await logAction(req.user, 'delete', 'shipment', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /shipments/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete shipment' });
  }
});

export default router;
