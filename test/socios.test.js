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
test('percentuais: rejeita sócio inexistente, inativo e item nulo', async () => {
  const { app, ca, ids } = await cenario();
  const base = itens(ids, [2500, 3000, 2500, 2000]);
  const extra = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: [...base, { socio_id: 99999, bp: 0 }] }, ca);
  assert.strictEqual(extra.status, 400);
  const inativo = (await app.call('POST', '/api/socios', { nome: 'Inativo' }, ca)).json.id;
  await app.call('PUT', `/api/socios/${inativo}`, { ativo: false }, ca);
  const comInativo = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: [...base, { socio_id: inativo, bp: 0 }] }, ca);
  assert.strictEqual(comInativo.status, 400);
  const nulo = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: [...base, null] }, ca);
  assert.strictEqual(nulo.status, 400);
});
