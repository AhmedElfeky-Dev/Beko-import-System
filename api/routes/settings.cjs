const express = require('express');
const { get, run } = require('../_lib/db.cjs');
const { verifyToken, requireAdmin } = require('../_lib/auth.cjs');

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
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/', requireAdmin, async (req, res) => {
  try {
    const updated = { ...(await getOrDefault('branding', BRANDING_DEFAULTS)), ...req.body };
    await run(`INSERT INTO settings (id, data, updated_at) VALUES ($1, $2, NOW())
               ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      ['branding', JSON.stringify(updated)]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/excel', async (_req, res) => {
  try { res.json(await getOrDefault('excel_import_export', EXCEL_DEFAULTS)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/excel', requireAdmin, async (req, res) => {
  try {
    const updated = { ...(await getOrDefault('excel_import_export', EXCEL_DEFAULTS)), ...req.body };
    await run(`INSERT INTO settings (id, data, updated_at) VALUES ($1, $2, NOW())
               ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      ['excel_import_export', JSON.stringify(updated)]);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
