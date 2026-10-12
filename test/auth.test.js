const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

test('login correto, errado, inativo e /me', async () => {
  const app = await criarApp();
  const id = await app.criarUsuario({ nome: 'Gilmar', email: 'g@x.com', perfil: 'ADMIN' });
  const ruim = await app.call('POST', '/api/login', { email: 'g@x.com', senha: 'errada' });
  assert.strictEqual(ruim.status, 401);
  const bom = await app.call('POST', '/api/login', { email: 'G@x.com', senha: 'senha-de-teste' });
  assert.strictEqual(bom.status, 200);
  assert.strictEqual(bom.json.perfil, 'ADMIN');
  assert.ok(bom.headers['Set-Cookie'].includes('HttpOnly'));
  const cookie = bom.headers['Set-Cookie'].split(';')[0];
  assert.strictEqual((await app.call('GET', '/api/me', null, cookie)).json.nome, 'Gilmar');
  await app.query('UPDATE usuario SET ativo = false WHERE id = $1', [id]);
  assert.strictEqual((await app.call('GET', '/api/me', null, cookie)).status, 401);
  assert.strictEqual((await app.call('POST', '/api/login', { email: 'g@x.com', senha: 'senha-de-teste' })).status, 401);
});
