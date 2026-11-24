const express = require('express');
const { get, run } = require('../_lib/db');
const { verifyToken, requireAdmin } = require('../_lib/auth');

const router = express.Router();
router.use(verifyToken);

const SETTINGS_ID = 'branding';
const EXCEL_ID = 'excel_import_export';
const BRANDING_DEFAULTS = {
  companyName: 'SwiftCargo',
  logoUrl: '',
  logoWidth: 32,
  logoHeight: 32,
};
const EXCEL_DEFAULTS = {
  importColumns: [],
  exportColumns: [],
};

async function getOrDefault(id, defaults) {
  const row = await get('SELECT data FROM settings WHERE id = $1', [id]);
  if (!row) return defaults;
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return { ...defaults, ...data };
}

// GET /api/settings — get branding settings
router.get('/', async (req, res) => {
  try {
    const data = await getOrDefault(SETTINGS_ID, BRANDING_DEFAULTS);
    res.json(data);
  } catch (err) {
    console.error('GET /settings error:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PUT /api/settings — update branding settings (admin only)
router.put('/', requireAdmin, async (req, res) => {
  try {
    const current = await getOrDefault(SETTINGS_ID, BRANDING_DEFAULTS);
    const updated = { ...current, ...req.body };
    await run(
      `INSERT INTO settings (id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [SETTINGS_ID, JSON.stringify(updated)]
    );
    res.json(updated);
  } catch (err) {
    console.error('PUT /settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/settings/excel — get excel import/export column settings
router.get('/excel', async (req, res) => {
  try {
    const data = await getOrDefault(EXCEL_ID, EXCEL_DEFAULTS);
    res.json(data);
  } catch (err) {
    console.error('GET /settings/excel error:', err);
    res.status(500).json({ error: 'Failed to load excel settings' });
  }
});

// PUT /api/settings/excel — update excel settings (admin only)
router.put('/excel', requireAdmin, async (req, res) => {
  try {
    const current = await getOrDefault(EXCEL_ID, EXCEL_DEFAULTS);
    const updated = { ...current, ...req.body };
    await run(
      `INSERT INTO settings (id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [EXCEL_ID, JSON.stringify(updated)]
    );
    res.json(updated);
  } catch (err) {
    console.error('PUT /settings/excel error:', err);
    res.status(500).json({ error: 'Failed to update excel settings' });
  }
});

module.exports = router;
