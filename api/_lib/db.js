const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Convert SQLite-style SQL to PostgreSQL
function toPg(sql) {
  let i = 0;
  let result = sql
    .replace(/\?/g, () => `$${++i}`)
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/lower\(/gi, 'LOWER(');

  // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(result)) {
    result = result.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');
    if (!/ON\s+CONFLICT/i.test(result)) result += ' ON CONFLICT DO NOTHING';
  }

  return result;
}

async function execute(rawSql, params = []) {
  const pgSql = toPg(rawSql);
  const client = await pool.connect();
  try {
    return await client.query(pgSql, params);
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
