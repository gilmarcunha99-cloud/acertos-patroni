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

test('sem SESSION_SECRET o login falha com 500, não 401', async () => {
  const app = await criarApp();
  await app.criarUsuario({ email: 'g@x.com' });
  const cookie = await app.login('g@x.com');
  const guardado = process.env.SESSION_SECRET;
  const erro = console.error;
  console.error = () => {};
  try {
    delete process.env.SESSION_SECRET;
    const r = await app.call('POST', '/api/login', { email: 'g@x.com', senha: 'senha-de-teste' });
    assert.strictEqual(r.status, 500);
    process.env.SESSION_SECRET = '';
    const r2 = await app.call('POST', '/api/login', { email: 'g@x.com', senha: 'senha-de-teste' });
    assert.strictEqual(r2.status, 500);
    assert.strictEqual((await app.call('GET', '/api/me', null, cookie)).status, 500);
  } finally {
    console.error = erro;
    process.env.SESSION_SECRET = guardado;
  }
});

test('token forjado com HS512 ou alg none é recusado em /api/me', async () => {
  const jwt = require('jsonwebtoken');
  const app = await criarApp();
  const id = await app.criarUsuario({ email: 'g@x.com' });
  const hs512 = jwt.sign({ id }, process.env.SESSION_SECRET, { algorithm: 'HS512' });
  const none = jwt.sign({ id }, '', { algorithm: 'none' });
  for (const t of [hs512, none]) {
    assert.strictEqual((await app.call('GET', '/api/me', null, `sid=${t}`)).status, 401);
  }
});

test('e-mail desconhecido e senha errada dão o mesmo 401', async () => {
  const app = await criarApp();
  await app.criarUsuario({ email: 'g@x.com' });
  const a = await app.call('POST', '/api/login', { email: 'g@x.com', senha: 'errada' });
  const b = await app.call('POST', '/api/login', { email: 'nao@x.com', senha: 'errada' });
  assert.strictEqual(a.status, 401);
  assert.strictEqual(b.status, 401);
  assert.deepStrictEqual(b.json, a.json);
  assert.strictEqual(b.headers, undefined);
});
