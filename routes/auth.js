const bcrypt = require('bcryptjs');
const { add, ok, fail } = require('../lib/router');
const { query } = require('../lib/db');
const { cookieFor, clearCookie } = require('../lib/auth');

const HASH_FALSO = bcrypt.hashSync('x', 10);

add('POST', '/api/login', { role: 'PUBLIC' }, async ({ body }) => {
  const [u] = await query('SELECT id, nome, perfil, senha_hash FROM usuario WHERE lower(email) = lower($1) AND ativo', [String(body.email || '').trim()]);
  const bateu = await bcrypt.compare(String(body.senha || ''), u ? u.senha_hash : HASH_FALSO);
  if (!u || !bateu) fail(401, 'Login ou senha incorretos.');
  return { status: 200, json: { id: u.id, nome: u.nome, perfil: u.perfil }, headers: { 'Set-Cookie': cookieFor(u.id) } };
});

add('POST', '/api/logout', { role: 'PUBLIC' }, async () => (
  { status: 200, json: { ok: true }, headers: { 'Set-Cookie': clearCookie() } }));

add('GET', '/api/me', { role: 'AUTH' }, async ({ user }) => ok(user));
