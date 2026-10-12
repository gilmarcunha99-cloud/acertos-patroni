const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

const ROTAS = [
  ['GET', '/api/usuarios'],
  ['POST', '/api/usuarios'],
  ['PUT', '/api/usuarios/1'],
  ['DELETE', '/api/usuarios/1'],
  ['POST', '/api/socios'],
  ['PUT', '/api/socios/1'],
  ['DELETE', '/api/socios/1'],
  ['POST', '/api/percentuais'],
  ['POST', '/api/meses/abrir'],
  ['PUT', '/api/meses/2026-10/saldo-inicial'],
  ['POST', '/api/meses/2026-10/lancamentos'],
  ['PUT', '/api/lancamentos/1'],
  ['DELETE', '/api/lancamentos/1'],
  ['PUT', '/api/meses/2026-10/aportes/1'],
  ['POST', '/api/meses/2026-10/fechar'],
  ['POST', '/api/meses/2026-10/reabrir'],
];

test('autorização em tabela: SOCIO recebe 403 e sem cookie recebe 401', async () => {
  const app = await criarApp();
  await app.criarUsuario({ email: 's@x.com', perfil: 'SOCIO' });
  const cs = await app.login('s@x.com');
  for (const [m, p] of ROTAS) {
    const comSocio = await app.call(m, p, {}, cs);
    assert.strictEqual(comSocio.status, 403, `${m} ${p} com SOCIO`);
    const semCookie = await app.call(m, p, {});
    assert.strictEqual(semCookie.status, 401, `${m} ${p} sem cookie`);
  }
});

async function cenario({ ym = '2026-10', saldo = 0 } = {}) {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  const ca = await app.login('a@x.com');
  const ids = [];
  for (const n of ['A', 'B']) ids.push((await app.call('POST', '/api/socios', { nome: n }, ca)).json.id);
  await app.call('POST', '/api/percentuais', { vigente_desde: ym, itens: [{ socio_id: ids[0], bp: 6000 }, { socio_id: ids[1], bp: 4000 }] }, ca);
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym, saldo_inicial_centavos: saldo }, ca)).status, 201);
  return { app, ca, ids };
}
const lanc = (app, ca, ym, extra) => app.call('POST', `/api/meses/${ym}/lancamentos`,
  { tipo: 'DEBITO', descritivo: 'Conta', valor_centavos: 100000, vencimento: `${ym}-15`, forma: 'BOLETO', ...extra }, ca);

test('saldo inicial: edita no mês aberto, 409 no fechado, 404 se inexistente', async () => {
  const { app, ca } = await cenario();
  const url = '/api/meses/2026-10/saldo-inicial';
  assert.strictEqual((await app.call('PUT', url, { saldo_inicial_centavos: -1623 }, ca)).status, 200);
  assert.strictEqual((await app.call('GET', '/api/meses/2026-10', null, ca)).json.saldo_inicial_centavos, -1623);
  assert.strictEqual((await app.call('PUT', url, { saldo_inicial_centavos: 'x' }, ca)).status, 400);
  assert.strictEqual((await app.call('PUT', '/api/meses/2027-01/saldo-inicial', { saldo_inicial_centavos: 1 }, ca)).status, 404);
  await lanc(app, ca, '2026-10');
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/fechar', { confirmar_diferenca: true }, ca)).status, 200);
  assert.strictEqual((await app.call('PUT', url, { saldo_inicial_centavos: 5 }, ca)).status, 409);
});

test('o mês seguinte herda o saldo final do mês fechado', async () => {
  const { app, ca } = await cenario({ saldo: 20000 });
  await lanc(app, ca, '2026-10');
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/fechar', {}, ca)).status, 200);
  const final = (await app.call('GET', '/api/meses/2026-10', null, ca)).json.totais.saldo_final;
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-11' }, ca)).status, 201);
  assert.strictEqual((await app.call('GET', '/api/meses/2026-11', null, ca)).json.saldo_inicial_centavos, final);
});

test('reabrir e fechar de novo recalcula e preserva ajuste e situação paga', async () => {
  const { app, ca, ids } = await cenario();
  await lanc(app, ca, '2026-10');
  await app.call('PUT', `/api/meses/2026-10/aportes/${ids[0]}`, { ajuste_centavos: -1000, ajuste_motivo: 'Acerto', ajuste_origem: '2026-09' }, ca);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/fechar', { confirmar_diferenca: true }, ca)).status, 200);
  await app.call('PUT', `/api/meses/2026-10/aportes/${ids[0]}`, { status: 'PAGO' }, ca);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/reabrir', {}, ca)).status, 200);
  const aberto = (await app.call('GET', '/api/meses/2026-10', null, ca)).json;
  assert.strictEqual(aberto.status, 'ABERTO');
  assert.strictEqual(aberto.aportes[0].ajuste_centavos, -1000);
  await lanc(app, ca, '2026-10', { descritivo: 'Outra', valor_centavos: 50000 });
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/fechar', { confirmar_diferenca: true }, ca)).status, 200);
  const v = (await app.call('GET', '/api/meses/2026-10', null, ca)).json;
  assert.strictEqual(v.aportes[0].base_centavos, 90000);
  assert.strictEqual(v.aportes[0].final_centavos, 89000);
  assert.strictEqual(v.aportes[0].ajuste_centavos, -1000);
  assert.strictEqual(v.aportes[0].status, 'PAGO');
  assert.strictEqual(v.aportes[1].status, 'PENDENTE');
});

test('abrir mês: dia 31 vira fim de fevereiro, parcela final some, crédito FIXO volta a receber', async () => {
  const { app, ca } = await cenario({ ym: '2026-01' });
  await lanc(app, ca, '2026-01', { descritivo: 'Fixo', vencimento: '2026-01-31', recorrencia: 'FIXO' });
  await lanc(app, ca, '2026-01', { descritivo: 'Parcela', vencimento: '2026-01-10', recorrencia: 'PARCELADO', parcela_atual: 1, parcela_total: 2 });
  await lanc(app, ca, '2026-01', { tipo: 'CREDITO', descritivo: 'Aluguel', vencimento: '2026-01-05', recorrencia: 'FIXO', status: 'RECEBIDO', forma: 'PIX' });
  assert.strictEqual((await app.call('POST', '/api/meses/2026-01/fechar', { confirmar_diferenca: true }, ca)).status, 200);
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-02' }, ca)).status, 201);
  const fev = (await app.call('GET', '/api/meses/2026-02', null, ca)).json.lancamentos;
  assert.strictEqual(fev.length, 3);
  assert.strictEqual(fev.find((l) => l.descritivo === 'Fixo').vencimento, '2026-02-28');
  assert.strictEqual(fev.find((l) => l.descritivo === 'Parcela').parcela_atual, 2);
  assert.strictEqual(fev.find((l) => l.descritivo === 'Aluguel').status, 'A_RECEBER');
  assert.strictEqual((await app.call('POST', '/api/meses/2026-02/fechar', { confirmar_diferenca: true }, ca)).status, 200);
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-03' }, ca)).status, 201);
  const mar = (await app.call('GET', '/api/meses/2026-03', null, ca)).json.lancamentos;
  assert.deepStrictEqual(mar.map((l) => l.descritivo).sort(), ['Aluguel', 'Fixo']);
  assert.strictEqual(mar.find((l) => l.descritivo === 'Fixo').vencimento, '2026-03-28');
});
