const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('CREATE TABLE IF NOT EXISTS _migracao (nome TEXT PRIMARY KEY)');
  const dir = path.join(__dirname, '../migrations');
  for (const f of fs.readdirSync(dir).sort()) {
    const { rows } = await pool.query('SELECT 1 FROM _migracao WHERE nome = $1', [f]);
    if (rows.length) continue;
    await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    await pool.query('INSERT INTO _migracao (nome) VALUES ($1)', [f]);
    console.log('aplicada', f);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
