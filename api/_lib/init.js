const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { get, run, pool } = require('./db');

let initialized = false;

async function initIfNeeded() {
  if (initialized) return;
  initialized = true;
  try {
    // Create all tables
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT DEFAULT '',
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS user_roles (
          user_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          PRIMARY KEY (user_id, role)
        );

        CREATE TABLE IF NOT EXISTS page_permissions (
          user_id TEXT NOT NULL,
          page TEXT NOT NULL,
          can_view BOOLEAN DEFAULT false,
          can_edit BOOLEAN DEFAULT false,
          can_delete BOOLEAN DEFAULT false,
          PRIMARY KEY (user_id, page)
        );

        CREATE TABLE IF NOT EXISTS shipments (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS settings (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS master_data (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          value TEXT NOT NULL,
          code TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (category, value)
        );
      `);
    } finally {
      client.release();
    }

    // Seed admin if no users exist
    const existing = await get('SELECT id FROM users LIMIT 1', []);
    if (!existing) {
      const adminId = uuidv4();
      const hash = bcrypt.hashSync('admin123', 10);

      await run(
        'INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
        [adminId, 'admin@swiftcargo.local', hash, 'Admin']
      );
      await run(
        'INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [adminId, 'admin']
      );
      for (const page of ['dashboard', 'shipments', 'costs', 'settings']) {
        await run(
          `INSERT INTO page_permissions (user_id, page, can_view, can_edit, can_delete)
           VALUES ($1, $2, true, true, true)
           ON CONFLICT DO NOTHING`,
          [adminId, page]
        );
      }

      // Seed master data
      const SEED_MASTER = [
        { category: 'supplier_name', value: 'Bosch Home Appliances' },
        { category: 'supplier_name', value: 'Samsung Electronics' },
        { category: 'supplier_name', value: 'LG Electronics' },
        { category: 'country_of_origin', value: 'Germany' },
        { category: 'country_of_origin', value: 'South Korea' },
        { category: 'country_of_origin', value: 'China' },
        { category: 'carrier', value: 'Maersk' },
        { category: 'carrier', value: 'MSC' },
        { category: 'carrier', value: 'CMA CGM' },
        { category: 'pol', value: 'Hamburg' },
        { category: 'pol', value: 'Shanghai' },
        { category: 'pol', value: 'Busan' },
        { category: 'pod', value: 'Jeddah' },
        { category: 'pod', value: 'Alexandria' },
        { category: 'pod', value: 'Port Said' },
        { category: 'broker', value: 'DHL Global Forwarding' },
        { category: 'broker', value: 'Agility Logistics' },
        { category: 'payment_term', value: 'Open Account' },
        { category: 'payment_term', value: 'CAD' },
        { category: 'payment_term', value: 'Advance' },
        { category: 'incoterm', value: 'CIF' },
        { category: 'incoterm', value: 'FOB' },
        { category: 'incoterm', value: 'DDP' },
        { category: 'bank_name', value: 'Deutsche Bank' },
        { category: 'bank_name', value: 'UniCredit' },
        { category: 'cost_item', value: 'Freight' },
        { category: 'cost_item', value: 'THC USD' },
        { category: 'cost_item', value: 'Customs Clearance' },
        { category: 'cost_item', value: 'Import Duty' },
        { category: 'cost_item', value: 'Transportation' },
        { category: 'cost_item', value: 'Storage' },
        { category: 'owner', value: 'Ragab' },
        { category: 'owner', value: 'Atef' },
        { category: 'owner', value: 'Mostafa' },
      ];

      for (const { category, value } of SEED_MASTER) {
        await run(
          `INSERT INTO master_data (id, category, value, code)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (category, value) DO NOTHING`,
          [uuidv4(), category, value, null]
        );
      }

      console.log('✅ DB initialized and seeded with admin@swiftcargo.local / admin123');
    }
  } catch (err) {
    console.error('initIfNeeded error:', err.message, err.stack);
    initialized = false; // allow retry on next request
  }
}

module.exports = { initIfNeeded };
