const test = require('node:test');
const assert = require('node:assert');
const W = require('../lib/webauthn');
const { criarApp } = require('./helpers/app');
const { novoAutenticador, registro, entrada } = require('./helpers/autenticador');

const RP = 'acertos.exemplo.com';
const ORIGEM = `https://${RP}`;
const HTTPS = { host: RP, 'x-forwarded-proto': 'https' };

async function cenario() {
  const app = await criarApp();
  const adminId = await app.criarUsuario({ nome: 'Admin', email: 'a@x.com', perfil: 'ADMIN' });
  const socioId = await app.criarUsuario({ nome: 'Sócio', email: 's@x.com', perfil: 'SOCIO' });
  return { app, adminId, socioId, ca: await app.login('a@x.com'), cs: await app.login('s@x.com') };
}

async function ativar(app, cookie, aut = novoAutenticador()) {
  const op = await app.call('POST', '/api/passkey/registro/opcoes', {}, cookie, HTTPS);
  assert.strictEqual(op.status, 200);
  const corpo = { ...registro(aut, { desafio: op.json.challenge, origem: ORIGEM, rpId: RP }), aparelho: 'Teste' };
  return { aut, op, r: await app.call('POST', '/api/passkey/registro', corpo, cookie, HTTPS) };
}

async function entrar(app, aut, extra = {}) {
  const op = await app.call('POST', '/api/passkey/entrada/opcoes', {}, null, HTTPS);
  assert.strictEqual(op.status, 200);
  const corpo = entrada(aut, { desafio: op.json.challenge, origem: ORIGEM, rpId: RP, ...extra });
  return { corpo, r: await app.call('POST', '/api/passkey/entrada', corpo, null, HTTPS) };
}

test('ativar a digital e entrar com ela, sem login nem senha', async () => {
  const { app, ca } = await cenario();
  const { aut, op, r } = await ativar(app, ca);
  assert.strictEqual(op.json.rp.name, 'Acertos Patroni');
  assert.strictEqual(op.json.authenticatorSelection.userVerification, 'required');
  assert.strictEqual(r.status, 201);
  const { r: e } = await entrar(app, aut);
  assert.strictEqual(e.status, 200);
  assert.strictEqual(e.json.perfil, 'ADMIN');
  const cookie = e.headers['Set-Cookie'].split(';')[0];
  assert.strictEqual((await app.call('GET', '/api/me', null, cookie)).json.nome, 'Admin');
});

test('o sócio também ativa a digital no próprio aparelho', async () => {
  const { app, cs } = await cenario();
  const { aut, r } = await ativar(app, cs);
  assert.strictEqual(r.status, 201);
  assert.strictEqual((await entrar(app, aut)).r.json.perfil, 'SOCIO');
});

test('desafio de uso único: a mesma resposta não entra duas vezes', async () => {
  const { app, ca } = await cenario();
  const { aut } = await ativar(app, ca);
  const { corpo, r } = await entrar(app, aut);
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await app.call('POST', '/api/passkey/entrada', corpo, null, HTTPS)).status, 401);
});

test('desafio vencido é recusado', async () => {
  const { app, ca } = await cenario();
  const { aut } = await ativar(app, ca);
  const op = await app.call('POST', '/api/passkey/entrada/opcoes', {}, null, HTTPS);
  await app.query("UPDATE webauthn_desafio SET expira_em = '2000-01-01T00:00:00.000Z'");
  const corpo = entrada(aut, { desafio: op.json.challenge, origem: ORIGEM, rpId: RP });
  assert.strictEqual((await app.call('POST', '/api/passkey/entrada', corpo, null, HTTPS)).status, 401);
});

test('usuário inativo não entra pela digital', async () => {
  const { app, ca, adminId } = await cenario();
  const { aut } = await ativar(app, ca);
  await app.query('UPDATE usuario SET ativo = false WHERE id = $1', [adminId]);
  assert.strictEqual((await entrar(app, aut)).r.status, 401);
});

test('assinatura de outro aparelho ou userHandle de outro usuário é recusado', async () => {
  const { app, ca, socioId } = await cenario();
  const { aut } = await ativar(app, ca);
  const impostor = { ...novoAutenticador(), credencialId: aut.credencialId };
  assert.strictEqual((await entrar(app, impostor)).r.status, 401);
  const handleOutro = W.paraBase64url(Buffer.from(String(socioId), 'utf8'));
  assert.strictEqual((await entrar(app, aut, { userHandle: handleOutro })).r.status, 401);
});

test('listar e remover só as próprias digitais; removida não entra mais', async () => {
  const { app, ca, cs } = await cenario();
  const { aut } = await ativar(app, ca);
  await ativar(app, cs);
  const minhas = await app.call('GET', '/api/passkey', null, ca);
  assert.strictEqual(minhas.json.length, 1);
  assert.strictEqual(minhas.json[0].aparelho, 'Teste');
  assert.ok(minhas.json[0].credencial_id);
  const daOutra = (await app.call('GET', '/api/passkey', null, cs)).json[0].id;
  assert.strictEqual((await app.call('DELETE', `/api/passkey/${daOutra}`, null, ca)).status, 404);
  assert.strictEqual((await app.call('DELETE', `/api/passkey/${minhas.json[0].id}`, null, ca)).status, 200);
  assert.strictEqual((await entrar(app, aut)).r.status, 401);
});

test('fora de https (ou em IP) a digital não é oferecida; sem login não ativa', async () => {
  const { app, ca } = await cenario();
  assert.strictEqual((await app.call('POST', '/api/passkey/registro/opcoes', {}, ca, { host: RP, 'x-forwarded-proto': 'http' })).status, 400);
  assert.strictEqual((await app.call('POST', '/api/passkey/entrada/opcoes', {}, null, { host: '10.0.0.1' })).status, 400);
  assert.strictEqual((await app.call('POST', '/api/passkey/registro/opcoes', {}, null, HTTPS)).status, 401);
});

test('a mesma credencial não é registrada duas vezes', async () => {
  const { app, ca } = await cenario();
  const { aut } = await ativar(app, ca);
  assert.strictEqual((await ativar(app, ca, aut)).r.status, 409);
});
