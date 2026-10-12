const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

async function cenario() {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  const ca = await app.login('a@x.com');
  const s = (await app.call('POST', '/api/socios', { nome: 'A' }, ca)).json.id;
  await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: [{ socio_id: s, bp: 10000 }] }, ca);
  await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: 0 }, ca);
  return { app, ca, s };
}
const LIM = 2147483647;

test('endereço com escape inválido responde 400', async () => {
  const { app, ca } = await cenario();
  const r = await app.call('GET', '/api/meses/abc%ZZ', null, ca);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.json.erro, 'Endereço inválido.');
});

test('id não numérico responde 404, não 500', async () => {
  const { app, ca } = await cenario();
  const l = { tipo: 'DEBITO', descritivo: 'x', valor_centavos: 1, vencimento: '2026-10-10', forma: 'PIX' };
  assert.strictEqual((await app.call('PUT', '/api/lancamentos/abc', l, ca)).status, 404);
  assert.strictEqual((await app.call('DELETE', '/api/lancamentos/abc', null, ca)).status, 404);
  assert.strictEqual((await app.call('PUT', '/api/socios/abc', {}, ca)).status, 404);
  assert.strictEqual((await app.call('DELETE', '/api/socios/abc', null, ca)).status, 404);
  assert.strictEqual((await app.call('PUT', '/api/usuarios/abc', {}, ca)).status, 404);
  assert.strictEqual((await app.call('DELETE', '/api/usuarios/abc', null, ca)).status, 404);
  assert.strictEqual((await app.call('PUT', '/api/meses/2026-10/aportes/abc', { ajuste_centavos: 0 }, ca)).status, 404);
  assert.strictEqual((await app.call('PUT', '/api/lancamentos/99999999999', l, ca)).status, 404);
});

test('valores acima do limite de inteiro respondem 400', async () => {
  const { app, ca, s } = await cenario();
  const l = { tipo: 'DEBITO', descritivo: 'x', valor_centavos: LIM + 1, vencimento: '2026-10-10', forma: 'PIX' };
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/lancamentos', l, ca)).status, 400);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/lancamentos', { ...l, valor_centavos: LIM }, ca)).status, 201);
  const aj = { ajuste_centavos: LIM + 1, ajuste_motivo: 'x', ajuste_origem: '2026-09' };
  assert.strictEqual((await app.call('PUT', `/api/meses/2026-10/aportes/${s}`, aj, ca)).status, 400);
  assert.strictEqual((await app.call('PUT', '/api/meses/2026-10/saldo-inicial', { saldo_inicial_centavos: LIM + 1 }, ca)).status, 400);
  assert.strictEqual((await app.call('PUT', '/api/meses/2026-10/saldo-inicial', { saldo_inicial_centavos: -LIM - 1 }, ca)).status, 400);
  assert.strictEqual((await app.call('PUT', '/api/meses/2026-10/saldo-inicial', { saldo_inicial_centavos: -LIM }, ca)).status, 200);
});
