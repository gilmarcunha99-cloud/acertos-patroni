const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

async function cenario() {
  const app = await criarApp();
  const adminId = await app.criarUsuario({ nome: 'Adm', email: 'a@x.com', perfil: 'ADMIN' });
  await app.criarUsuario({ nome: 'Soc', email: 's@x.com', perfil: 'SOCIO' });
  return { app, adminId, ca: await app.login('a@x.com'), cs: await app.login('s@x.com') };
}

test('SOCIO não acessa usuários', async () => {
  const { app, cs } = await cenario();
  assert.strictEqual((await app.call('GET', '/api/usuarios', null, cs)).status, 403);
});
test('cria, valida e edita', async () => {
  const { app, ca } = await cenario();
  assert.strictEqual((await app.call('POST', '/api/usuarios', { nome: 'N', email: 'n@x.com', senha: 'curta', perfil: 'SOCIO' }, ca)).status, 400);
  const r = await app.call('POST', '/api/usuarios', { nome: 'N', email: 'n@x.com', senha: 'senha-longa-1', perfil: 'SOCIO' }, ca);
  assert.strictEqual(r.status, 201);
  assert.strictEqual((await app.call('POST', '/api/usuarios', { nome: 'N2', email: 'N@x.com', senha: 'senha-longa-1', perfil: 'SOCIO' }, ca)).status, 409);
  assert.strictEqual((await app.call('PUT', `/api/usuarios/${r.json.id}`, { nome: 'Novo Nome' }, ca)).status, 200);
  const lista = await app.call('GET', '/api/usuarios', null, ca);
  assert.ok(lista.json.find((u) => u.nome === 'Novo Nome'));
  assert.strictEqual(lista.json[0].senha_hash, undefined);
});
test('último ADMIN não pode ser excluído, inativado nem rebaixado', async () => {
  const { app, adminId, ca } = await cenario();
  assert.strictEqual((await app.call('DELETE', `/api/usuarios/${adminId}`, null, ca)).status, 409);
  assert.strictEqual((await app.call('PUT', `/api/usuarios/${adminId}`, { ativo: false }, ca)).status, 409);
  assert.strictEqual((await app.call('PUT', `/api/usuarios/${adminId}`, { perfil: 'SOCIO' }, ca)).status, 409);
});
test('excluir usuário ligado a sócio apenas inativa', async () => {
  const { app, ca } = await cenario();
  const u = await app.call('POST', '/api/usuarios', { nome: 'V', email: 'v@x.com', senha: 'senha-longa-1', perfil: 'SOCIO' }, ca);
  await app.query("INSERT INTO socio (usuario_id, nome) VALUES ($1, 'V')", [u.json.id]);
  const d = await app.call('DELETE', `/api/usuarios/${u.json.id}`, null, ca);
  assert.deepStrictEqual(d.json, { inativado: true });
  const [row] = await app.query('SELECT ativo FROM usuario WHERE id = $1', [u.json.id]);
  assert.strictEqual(row.ativo, false);
});
test('exclui de verdade quando sem vínculo', async () => {
  const { app, ca } = await cenario();
  const u = await app.call('POST', '/api/usuarios', { nome: 'W', email: 'w@x.com', senha: 'senha-longa-1', perfil: 'SOCIO' }, ca);
  assert.deepStrictEqual((await app.call('DELETE', `/api/usuarios/${u.json.id}`, null, ca)).json, { excluido: true });
});
