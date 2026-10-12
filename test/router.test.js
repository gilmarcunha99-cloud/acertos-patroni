const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');
const { add, ok } = require('../lib/router');

add('GET', '/api/_t/publico', { role: 'PUBLIC' }, async () => ok({ a: 1 }));
add('GET', '/api/_t/auth', { role: 'AUTH' }, async ({ user }) => ok({ perfil: user.perfil }));
add('POST', '/api/_t/admin', { role: 'ADMIN' }, async () => ok({ feito: true }));

test('401 sem login, 403 para SOCIO, 200 para ADMIN, 404 desconhecida', async () => {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  await app.criarUsuario({ email: 's@x.com', perfil: 'SOCIO' });
  assert.strictEqual((await app.call('GET', '/api/_t/publico')).status, 200);
  assert.strictEqual((await app.call('GET', '/api/_t/auth')).status, 401);
  const cs = await app.login('s@x.com');
  const ca = await app.login('a@x.com');
  assert.strictEqual((await app.call('GET', '/api/_t/auth', null, cs)).json.perfil, 'SOCIO');
  assert.strictEqual((await app.call('POST', '/api/_t/admin', {}, cs)).status, 403);
  assert.strictEqual((await app.call('POST', '/api/_t/admin', {}, ca)).status, 200);
  assert.strictEqual((await app.call('GET', '/api/_t/nada')).status, 404);
});
