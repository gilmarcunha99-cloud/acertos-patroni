const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

async function cenario() {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  await app.criarUsuario({ email: 's@x.com', perfil: 'SOCIO' });
  const ca = await app.login('a@x.com');
  const ids = {};
  for (const n of ['Adriano', 'Henrique', 'Lígia', 'Luiz']) {
    ids[n] = (await app.call('POST', '/api/socios', { nome: n }, ca)).json.id;
  }
  return { app, ca, cs: await app.login('s@x.com'), ids };
}
const itens = (ids, bps) => Object.values(ids).map((socio_id, i) => ({ socio_id, bp: bps[i] }));

test('percentuais: soma 100% e cobertura de todos os sócios ativos', async () => {
  const { app, ca, ids } = await cenario();
  const r1 = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [2500, 3000, 2500, 1000]) }, ca);
  assert.strictEqual(r1.status, 400);
  const faltando = itens(ids, [2500, 3000, 2500, 2000]).slice(0, 3);
  assert.strictEqual((await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: faltando }, ca)).status, 400);
  const ok = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [2500, 3000, 2500, 2000]) }, ca);
  assert.strictEqual(ok.status, 200);
  const lista = await app.call('GET', '/api/socios', null, ca);
  assert.deepStrictEqual(lista.json.map((s) => s.historico.length), [1, 1, 1, 1]);
});
test('mudança futura mantém histórico; SOCIO lê mas não escreve', async () => {
  const { app, ca, cs, ids } = await cenario();
  await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [2500, 3000, 2500, 2000]) }, ca);
  await app.call('POST', '/api/percentuais', { vigente_desde: '2026-12', itens: itens(ids, [2500, 3500, 2500, 1500]) }, ca);
  const lista = await app.call('GET', '/api/socios', null, cs);
  assert.strictEqual(lista.status, 200);
  assert.strictEqual(lista.json[1].historico.length, 2);
  assert.strictEqual((await app.call('POST', '/api/socios', { nome: 'X' }, cs)).status, 403);
  assert.strictEqual((await app.call('POST', '/api/percentuais', { vigente_desde: '2026-12', itens: [] }, cs)).status, 403);
});
test('não altera percentual de mês fechado', async () => {
  const { app, ca, ids } = await cenario();
  await app.query("INSERT INTO mes (ym, status) VALUES ('2026-10', 'FECHADO')");
  const r = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [2500, 3000, 2500, 2000]) }, ca);
  assert.strictEqual(r.status, 409);
});
test('excluir: apaga sem histórico, inativa com histórico', async () => {
  const { app, ca, ids } = await cenario();
  const novo = (await app.call('POST', '/api/socios', { nome: 'Novo' }, ca)).json.id;
  assert.deepStrictEqual((await app.call('DELETE', `/api/socios/${novo}`, null, ca)).json, { excluido: true });
  await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [2500, 3000, 2500, 2000]) }, ca);
  assert.deepStrictEqual((await app.call('DELETE', `/api/socios/${ids.Luiz}`, null, ca)).json, { inativado: true });
});
test('percentuais: rejeita sócio inexistente, inativo com bp > 0 e item nulo; inativo com bp 0 passa', async () => {
  const { app, ca, ids } = await cenario();
  const base = itens(ids, [2500, 3000, 2500, 2000]);
  const extra = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: [...base, { socio_id: 99999, bp: 0 }] }, ca);
  assert.strictEqual(extra.status, 400);
  const inativo = (await app.call('POST', '/api/socios', { nome: 'Inativo' }, ca)).json.id;
  await app.call('PUT', `/api/socios/${inativo}`, { ativo: false }, ca);
  const comBp = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: [...base, { socio_id: inativo, bp: 100 }] }, ca);
  assert.strictEqual(comBp.status, 400);
  const comZero = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: [...base, { socio_id: inativo, bp: 0 }] }, ca);
  assert.strictEqual(comZero.status, 200);
  const nulo = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: [...base, null] }, ca);
  assert.strictEqual(nulo.status, 400);
});

async function mesComDebito(app, ca, ym, saldo) {
  const body = saldo === undefined ? { ym } : { ym, saldo_inicial_centavos: saldo };
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', body, ca)).status, 201);
  await app.call('POST', `/api/meses/${ym}/lancamentos`, { tipo: 'DEBITO', descritivo: 'Conta', valor_centavos: 100000, vencimento: `${ym}-15`, forma: 'BOLETO' }, ca);
}

test('retirar sócio zera o percentual e o mês seguinte fecha', async () => {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  const ca = await app.login('a@x.com');
  const ids = {};
  for (const n of ['A', 'B', 'C']) ids[n] = (await app.call('POST', '/api/socios', { nome: n }, ca)).json.id;
  await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [5000, 3000, 2000]) }, ca);
  await mesComDebito(app, ca, '2026-10', 0);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/fechar', {}, ca)).status, 200);
  assert.deepStrictEqual((await app.call('DELETE', `/api/socios/${ids.C}`, null, ca)).json, { inativado: true });
  await mesComDebito(app, ca, '2026-11');
  const r = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-11', itens: [{ socio_id: ids.A, bp: 6000 }, { socio_id: ids.B, bp: 4000 }] }, ca);
  assert.strictEqual(r.status, 200);
  const f = await app.call('POST', '/api/meses/2026-11/fechar', {}, ca);
  assert.strictEqual(f.status, 200);
  const v = (await app.call('GET', '/api/meses/2026-11', null, ca)).json;
  assert.deepStrictEqual(v.aportes.map((a) => a.socio_id), [ids.A, ids.B]);
  const out = (await app.call('GET', '/api/meses/2026-10', null, ca)).json;
  assert.strictEqual(out.aportes.length, 3);
});

test('vigência ponta a ponta: mês fechado não muda, o seguinte usa os novos percentuais', async () => {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  const ca = await app.login('a@x.com');
  const ids = {};
  for (const n of ['A', 'B']) ids[n] = (await app.call('POST', '/api/socios', { nome: n }, ca)).json.id;
  await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [5000, 5000]) }, ca);
  await mesComDebito(app, ca, '2026-10', 0);
  await app.call('POST', '/api/meses/2026-10/fechar', {}, ca);
  const antes = (await app.call('GET', '/api/meses/2026-10', null, ca)).json.aportes.map((a) => [a.bp, a.base_centavos, a.final_centavos]);
  assert.deepStrictEqual(antes, [[5000, 50000, 50000], [5000, 50000, 50000]]);
  assert.strictEqual((await app.call('POST', '/api/percentuais', { vigente_desde: '2026-11', itens: itens(ids, [7000, 3000]) }, ca)).status, 200);
  await mesComDebito(app, ca, '2026-11');
  await app.call('POST', '/api/meses/2026-11/fechar', {}, ca);
  const depoisOut = (await app.call('GET', '/api/meses/2026-10', null, ca)).json.aportes.map((a) => [a.bp, a.base_centavos, a.final_centavos]);
  assert.deepStrictEqual(depoisOut, antes);
  const nov = (await app.call('GET', '/api/meses/2026-11', null, ca)).json.aportes;
  assert.deepStrictEqual(nov.map((a) => a.bp), [7000, 3000]);
  assert.deepStrictEqual(nov.map((a) => a.final_centavos), [70000, 30000]);
});
