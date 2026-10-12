const { Pool } = require('pg');
let pool = null;

function setPool(p) { pool = p; }
function getPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000 });
    pool.on('error', (e) => console.error('pool', e.message));
  return pool;
}

async function query(sql, params = []) {
  return (await getPool().query(sql, params)).rows;
}

async function tx(fn) {
  const c = await getPool().connect();
  let erro;
  try {
    await c.query('BEGIN');
    const r = await fn(async (sql, params = []) => (await c.query(sql, params)).rows);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* conexão quebrada: descartada abaixo */ }
    erro = e;
    throw e;
  } finally {
    c.release(erro);
  }
}

module.exports = { setPool, query, tx };
