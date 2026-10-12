const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

async function cenario() {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  const ca = await app.login('a@x.com');
  const ids = {};
  for (const n of ['Adriano', 'Henrique', 'Lígia', 'Luiz']) ids[n] = (await app.call('POST', '/api/socios', { nome: n }, ca)).json.id;
  await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: Object.values(ids).map((socio_id, i) => ({ socio_id, bp: [2500, 3000, 2500, 2000][i] })) }, ca);
  await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: -1623 }, ca);
  const mk = (descritivo, v, d, forma) => app.call('POST', '/api/meses/2026-10/lancamentos', { tipo: 'DEBITO', descritivo, valor_centavos: v, vencimento: d, forma }, ca);
  await mk('Contabilidade', 26700, '2026-10-15', 'BOLETO');
  await mk('Condominio', 338304, '2026-10-20', 'BOLETO');
  await mk('ICMS', 155521, '2026-10-25', 'GUIA');
  await mk('DASN', 30225, '2026-10-25', 'GUIA');
  return { app, ca, ids };
}

test('fechar grava aportes de outubro/26 e congela', async () => {
  const { app, ca } = await cenario();
  const f = await app.call('POST', '/api/meses/2026-10/fechar', {}, ca);
  assert.strictEqual(f.status, 200);
  const v = (await app.call('GET', '/api/meses/2026-10', null, ca)).json;
  assert.strictEqual(v.status, 'FECHADO');
  assert.strictEqual(v.provisorio, false);
  assert.deepStrictEqual(v.aportes.map((a) => a.final_centavos), [138093, 165712, 138093, 110475]);
  assert.strictEqual(v.totais.saldo_final, 0);
});
test('ajuste exige motivo e origem; diferença exige confirmação', async () => {
  const { app, ca, ids } = await cenario();
  const url = `/api/meses/2026-10/aportes/${ids['Lígia']}`;
  assert.strictEqual((await app.call('PUT', url, { ajuste_centavos: -30225 }, ca)).status, 400);
  assert.strictEqual((await app.call('PUT', url, { ajuste_centavos: -30225, ajuste_motivo: 'Acerto de setembro com o Henrique', ajuste_origem: '2026-09' }, ca)).status, 200);
  const r = await app.call('POST', '/api/meses/2026-10/fechar', {}, ca);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.json.diferenca_centavos, -30225);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/fechar', { confirmar_diferenca: true }, ca)).status, 200);
  const v = (await app.call('GET', '/api/meses/2026-10', null, ca)).json;
  assert.strictEqual(v.aportes[2].final_centavos, 107868);
});
test('marcar pago só depois de fechar; ajuste trava no fechado', async () => {
  const { app, ca, ids } = await cenario();
  const url = `/api/meses/2026-10/aportes/${ids.Adriano}`;
  assert.strictEqual((await app.call('PUT', url, { status: 'PAGO' }, ca)).status, 409);
  await app.call('POST', '/api/meses/2026-10/fechar', {}, ca);
  assert.strictEqual((await app.call('PUT', url, { status: 'PAGO' }, ca)).status, 200);
  assert.strictEqual((await app.call('PUT', url, { ajuste_centavos: 5, ajuste_motivo: 'x', ajuste_origem: '2026-09' }, ca)).status, 409);
  const v = (await app.call('GET', '/api/meses/2026-10', null, ca)).json;
  assert.strictEqual(v.aportes[0].status, 'PAGO');
});
test('reabrir só sem mês posterior', async () => {
  const { app, ca } = await cenario();
  await app.call('POST', '/api/meses/2026-10/fechar', {}, ca);
  await app.call('POST', '/api/meses/abrir', { ym: '2026-11' }, ca);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/reabrir', {}, ca)).status, 409);
  await app.query("DELETE FROM mes WHERE ym = '2026-11'");
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/reabrir', {}, ca)).status, 200);
  assert.strictEqual((await app.call('GET', '/api/meses/2026-10', null, ca)).json.status, 'ABERTO');
});
test('fechar sem percentuais recusa', async () => {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  const ca = await app.login('a@x.com');
  await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: 0 }, ca);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/fechar', {}, ca)).status, 409);
});
