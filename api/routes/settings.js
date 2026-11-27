import express from 'express';
import { get, run } from '../_lib/db.js';
import { verifyToken, requireAdmin } from '../_lib/auth.js';
import { logAction } from '../_lib/auditLog.js';

const router = express.Router();
router.use(verifyToken);

const BRANDING_DEFAULTS = { companyName: 'SwiftCargo', logoUrl: '', logoWidth: 32, logoHeight: 32 };
const EXCEL_DEFAULTS = { importColumns: [], exportColumns: [] };

async function getOrDefault(id, defaults) {
  const row = await get('SELECT data FROM settings WHERE id = $1', [id]);
  if (!row) return defaults;
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return { ...defaults, ...data };
}

router.get('/', async (_req, res) => {
  try { res.json(await getOrDefault('branding', BRANDING_DEFAULTS)); }
  catch (err) {
    console.error('GET /settings error:', err.message);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.put('/', requireAdmin, async (req, res) => {
  try {
    const updated = { ...(await getOrDefault('branding', BRANDING_DEFAULTS)), ...req.body };
    await run(`INSERT INTO settings (id, data, updated_at) VALUES ($1, $2, NOW())
               ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      ['branding', JSON.stringify(updated)]);
    await logAction(req.user, 'update', 'settings', 'branding');
    res.json(updated);
  } catch (err) {
    console.error('PUT /settings error:', err.message);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/excel', async (_req, res) => {
  try { res.json(await getOrDefault('excel_import_export', EXCEL_DEFAULTS)); }
  catch (err) {
    console.error('GET /settings/excel error:', err.message);
    res.status(500).json({ error: 'Failed to load excel settings' });
  }
});

router.put('/excel', requireAdmin, async (req, res) => {
  try {
    const updated = { ...(await getOrDefault('excel_import_export', EXCEL_DEFAULTS)), ...req.body };
    await run(`INSERT INTO settings (id, data, updated_at) VALUES ($1, $2, NOW())
               ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      ['excel_import_export', JSON.stringify(updated)]);
    await logAction(req.user, 'update', 'settings', 'excel_import_export');
    res.json(updated);
  } catch (err) {
    console.error('PUT /settings/excel error:', err.message);
    res.status(500).json({ error: 'Failed to update excel settings' });
  }
});

export default router;
