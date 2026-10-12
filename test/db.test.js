const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

test('o Pool real é criado uma vez e recebe um único ouvinte de erro', async () => {
  const pgPath = require.resolve('pg');
  const dbPath = path.join(__dirname, '../lib/db.js');
  const pgOriginal = require.cache[pgPath];
  let criados = 0;
  let ouvintes = 0;
  class PoolFalso {
    constructor() { criados += 1; }
    on(evento) { if (evento === 'error') ouvintes += 1; }
    async query() { return { rows: [] }; }
  }
  require.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: { Pool: PoolFalso } };
  delete require.cache[dbPath];
  try {
    const { query } = require(dbPath);
    for (let i = 0; i < 25; i += 1) await query('SELECT 1');
    assert.strictEqual(criados, 1);
    assert.strictEqual(ouvintes, 1);
  } finally {
    if (pgOriginal) require.cache[pgPath] = pgOriginal; else delete require.cache[pgPath];
    delete require.cache[dbPath];
  }
});
