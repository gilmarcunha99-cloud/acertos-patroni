const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

(async () => {
  const { ADMIN_EMAIL, ADMIN_NOME = 'Administrador', ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
    console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mín. 8 caracteres) no ambiente.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const q = async (s, p = []) => (await pool.query(s, p)).rows;
  if (!(await q('SELECT 1 FROM usuario WHERE lower(email) = lower($1)', [ADMIN_EMAIL])).length) {
    await q('INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES ($1,$2,$3,$4)', [ADMIN_NOME, ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASSWORD, 10), 'ADMIN']);
    console.log('administrador criado');
  }
  for (const [nome, bp] of [['Adriano', 2500], ['Henrique', 3000], ['Lígia', 2500], ['Luiz', 2000]]) {
    let [s] = await q('SELECT id FROM socio WHERE nome = $1', [nome]);
    if (!s) [s] = await q('INSERT INTO socio (nome) VALUES ($1) RETURNING id', [nome]);
    await q('INSERT INTO socio_percentual (socio_id, vigente_desde, bp) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [s.id, '2026-10', bp]);
  }
  console.log('sócios e percentuais prontos');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
