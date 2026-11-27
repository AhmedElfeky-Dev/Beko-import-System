import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { get, run, pool } from './db.js';

let initialized = false;

export async function initIfNeeded() {
  if (initialized) return;
  initialized = true;
  try {
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

    const existing = await get('SELECT id FROM users LIMIT 1', []);
    if (!existing) {
      const adminId = uuidv4();
      const hash = bcrypt.hashSync('admin123', 10);
      await run('INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
        [adminId, 'admin@swiftcargo.local', hash, 'Admin']);
      await run('INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [adminId, 'admin']);
      for (const page of ['dashboard', 'shipments', 'costs', 'settings']) {
        await run(`INSERT INTO page_permissions (user_id, page, can_view, can_edit, can_delete)
                   VALUES ($1, $2, true, true, true) ON CONFLICT DO NOTHING`, [adminId, page]);
      }
      const SEED = [
        ['supplier_name','Bosch Home Appliances'],['supplier_name','Samsung Electronics'],['supplier_name','LG Electronics'],
        ['country_of_origin','Germany'],['country_of_origin','South Korea'],['country_of_origin','China'],
        ['carrier','Maersk'],['carrier','MSC'],['carrier','CMA CGM'],
        ['pol','Hamburg'],['pol','Shanghai'],['pol','Busan'],
        ['pod','Jeddah'],['pod','Alexandria'],['pod','Port Said'],
        ['broker','DHL Global Forwarding'],['broker','Agility Logistics'],
        ['payment_term','Open Account'],['payment_term','CAD'],['payment_term','Advance'],
        ['incoterm','CIF'],['incoterm','FOB'],['incoterm','DDP'],
        ['bank_name','Deutsche Bank'],['bank_name','UniCredit'],
        ['cost_item','Freight'],['cost_item','THC USD'],['cost_item','Customs Clearance'],
        ['cost_item','Import Duty'],['cost_item','Transportation'],['cost_item','Storage'],
        ['owner','Ragab'],['owner','Atef'],['owner','Mostafa'],
      ];
      for (const [category, value] of SEED) {
        await run(`INSERT INTO master_data (id, category, value, code) VALUES ($1,$2,$3,$4)
                   ON CONFLICT (category, value) DO NOTHING`, [uuidv4(), category, value, null]);
      }
      console.log('✅ DB initialized: admin@swiftcargo.local / admin123');
    }
  } catch (err) {
    console.error('initIfNeeded error:', err.message);
    initialized = false;
  }
}
