const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

async function cenario() {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  await app.criarUsuario({ email: 's@x.com', perfil: 'SOCIO' });
  return { app, ca: await app.login('a@x.com'), cs: await app.login('s@x.com') };
}

test('primeiro mês exige saldo inicial; SOCIO vê mas não abre', async () => {
  const { app, ca, cs } = await cenario();
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-10' }, ca)).status, 400);
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: -1623 }, cs)).status, 403);
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: -1623 }, ca)).status, 201);
  const v = await app.call('GET', '/api/meses/2026-10', null, cs);
  assert.strictEqual(v.json.saldo_inicial_centavos, -1623);
  assert.strictEqual((await app.call('GET', '/api/meses/2030-01', null, cs)).status, 404);
  assert.strictEqual((await app.call('GET', '/api/meses', null, cs)).json.length, 1);
});
test('próximo mês só abre com o anterior fechado, e copia fixos e parcelados', async () => {
  const { app, ca } = await cenario();
  await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: 0 }, ca);
  const mk = (o) => app.call('POST', '/api/meses/2026-10/lancamentos', { tipo: 'DEBITO', forma: 'GUIA', valor_centavos: 100, vencimento: '2026-10-25', ...o }, ca);
  await mk({ descritivo: 'ICMS', recorrencia: 'PARCELADO', parcela_atual: 17, parcela_total: 119 });
  await mk({ descritivo: 'Avulso' });
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-11' }, ca)).status, 409);
  await app.query("UPDATE mes SET status = 'FECHADO' WHERE ym = '2026-10'");
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-12' }, ca)).status, 400);
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-11' }, ca)).status, 201);
  const v = (await app.call('GET', '/api/meses/2026-11', null, ca)).json;
  assert.strictEqual(v.lancamentos.length, 1);
  assert.strictEqual(v.lancamentos[0].parcela_atual, 18);
  assert.strictEqual(v.lancamentos[0].vencimento, '2026-11-25');
});
