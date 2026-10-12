const bcrypt = require('bcryptjs');
const { add, ok, fail } = require('../lib/router');
const { query } = require('../lib/db');
const { cookieFor, clearCookie } = require('../lib/auth');

add('POST', '/api/login', { role: 'PUBLIC' }, async ({ body }) => {
  const [u] = await query('SELECT * FROM usuario WHERE lower(email) = lower($1) AND ativo', [String(body.email || '')]);
  if (!u || !(await bcrypt.compare(String(body.senha || ''), u.senha_hash))) fail(401, 'E-mail ou senha incorretos.');
  return { status: 200, json: { id: u.id, nome: u.nome, perfil: u.perfil }, headers: { 'Set-Cookie': cookieFor(u.id) } };
});

add('POST', '/api/logout', { role: 'PUBLIC' }, async () => (
  { status: 200, json: { ok: true }, headers: { 'Set-Cookie': clearCookie() } }));

add('GET', '/api/me', { role: 'AUTH' }, async ({ user }) => ok(user));
