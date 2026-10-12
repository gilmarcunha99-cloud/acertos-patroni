const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

test('o login pode ser um nome de usuário, sem @, e não diferencia maiúsculas', async () => {
  const app = await criarApp();
  await app.criarUsuario({ nome: 'Adm', email: 'a@x.com', perfil: 'ADMIN' });
  const ca = await app.login('a@x.com');

  const criado = await app.call('POST', '/api/usuarios', { nome: 'Administrador', email: 'ADMIN', senha: 'senha-longa-1', perfil: 'ADMIN' }, ca);
  assert.strictEqual(criado.status, 201);

  for (const login of ['ADMIN', 'admin', ' Admin ']) {
    const r = await app.call('POST', '/api/login', { email: login, senha: 'senha-longa-1' });
    assert.strictEqual(r.status, 200, `login "${login}"`);
    assert.strictEqual(r.json.nome, 'Administrador');
  }
  assert.strictEqual((await app.call('POST', '/api/login', { email: 'ADMIN', senha: 'errada-errada' })).status, 401);
});

test('o login não aceita espaços nem valores curtos demais', async () => {
  const app = await criarApp();
  await app.criarUsuario({ nome: 'Adm', email: 'a@x.com', perfil: 'ADMIN' });
  const ca = await app.login('a@x.com');
  for (const ruim of ['', 'a', 'dois nomes']) {
    const r = await app.call('POST', '/api/usuarios', { nome: 'N', email: ruim, senha: 'senha-longa-1', perfil: 'SOCIO' }, ca);
    assert.strictEqual(r.status, 400, `login "${ruim}"`);
  }
  const dup = await app.call('POST', '/api/usuarios', { nome: 'N', email: 'A@X.COM', senha: 'senha-longa-1', perfil: 'SOCIO' }, ca);
  assert.strictEqual(dup.status, 409);
});
