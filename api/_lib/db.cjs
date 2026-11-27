const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

async function execute(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function all(sql, params = []) {
  const r = await execute(sql, params);
  return r.rows;
}

async function get(sql, params = []) {
  const r = await execute(sql, params);
  return r.rows[0] || null;
}

async function run(sql, params = []) {
  await execute(sql, params);
}

module.exports = { all, get, run, pool };
