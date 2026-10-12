const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

const corpo = { tipo: 'DEBITO', descritivo: 'Contabilidade', valor_centavos: 26700, vencimento: '2026-10-15', forma: 'BOLETO' };
async function cenario() {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  await app.criarUsuario({ email: 's@x.com', perfil: 'SOCIO' });
  const ca = await app.login('a@x.com');
  await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: -1623 }, ca);
  return { app, ca, cs: await app.login('s@x.com') };
}

test('cria, valida, edita e exclui', async () => {
  const { app, ca } = await cenario();
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/lancamentos', { ...corpo, valor_centavos: -5 }, ca)).status, 400);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/lancamentos', { ...corpo, vencimento: '15/10/2026' }, ca)).status, 400);
  const c = await app.call('POST', '/api/meses/2026-10/lancamentos', corpo, ca);
  assert.strictEqual(c.status, 201);
  const id = c.json.id;
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${id}`, { ...corpo, status: 'PAGO' }, ca)).status, 200);
  const v = (await app.call('GET', '/api/meses/2026-10', null, ca)).json;
  assert.strictEqual(v.lancamentos[0].status, 'PAGO');
  assert.strictEqual(v.lancamentos[0].saldo_centavos, -28323);
  assert.strictEqual((await app.call('DELETE', `/api/lancamentos/${id}`, null, ca)).status, 200);
});
test('SOCIO não escreve; mês fechado recusa edição', async () => {
  const { app, ca, cs } = await cenario();
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/lancamentos', corpo, cs)).status, 403);
  const id = (await app.call('POST', '/api/meses/2026-10/lancamentos', corpo, ca)).json.id;
  await app.query("UPDATE mes SET status = 'FECHADO'");
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/lancamentos', corpo, ca)).status, 409);
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${id}`, corpo, ca)).status, 409);
  assert.strictEqual((await app.call('DELETE', `/api/lancamentos/${id}`, null, ca)).status, 409);
});
