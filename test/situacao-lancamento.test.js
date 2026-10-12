const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

const debito = { tipo: 'DEBITO', descritivo: 'Contabilidade', valor_centavos: 26700, vencimento: '2026-10-15', forma: 'BOLETO' };
const credito = { tipo: 'CREDITO', descritivo: 'Reembolso', valor_centavos: 5000, vencimento: '2026-10-18', forma: 'PIX' };

async function cenario() {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  await app.criarUsuario({ email: 's@x.com', perfil: 'SOCIO' });
  const ca = await app.login('a@x.com');
  await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: -1623 }, ca);
  const d = (await app.call('POST', '/api/meses/2026-10/lancamentos', debito, ca)).json.id;
  const c = (await app.call('POST', '/api/meses/2026-10/lancamentos', credito, ca)).json.id;
  return { app, ca, cs: await app.login('s@x.com'), d, c };
}
const situacao = async (app, ca, id) =>
  (await app.call('GET', '/api/meses/2026-10', null, ca)).json.lancamentos.find((l) => l.id === id).status;

test('administrador marca débito como pago e desfaz, em mês aberto', async () => {
  const { app, ca, d } = await cenario();
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${d}/situacao`, { status: 'PAGO' }, ca)).status, 200);
  assert.strictEqual(await situacao(app, ca, d), 'PAGO');
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${d}/situacao`, { status: 'A_PAGAR' }, ca)).status, 200);
  assert.strictEqual(await situacao(app, ca, d), 'A_PAGAR');
});

test('em mês fechado, só a situação muda; o resto continua travado e o saldo não muda', async () => {
  const { app, ca, d, c } = await cenario();
  await app.query("UPDATE mes SET status = 'FECHADO' WHERE ym = '2026-10'");
  const antes = (await app.call('GET', '/api/meses/2026-10', null, ca)).json.totais;
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${d}/situacao`, { status: 'PAGO' }, ca)).status, 200);
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${c}/situacao`, { status: 'RECEBIDO' }, ca)).status, 200);
  assert.strictEqual(await situacao(app, ca, d), 'PAGO');
  assert.strictEqual(await situacao(app, ca, c), 'RECEBIDO');
  assert.deepStrictEqual((await app.call('GET', '/api/meses/2026-10', null, ca)).json.totais, antes);
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${d}`, { ...debito, valor_centavos: 1 }, ca)).status, 409);
});

test('situação precisa combinar com o tipo; sócio não muda; lançamento inexistente dá 404', async () => {
  const { app, ca, cs, d, c } = await cenario();
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${d}/situacao`, { status: 'RECEBIDO' }, ca)).status, 400);
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${c}/situacao`, { status: 'PAGO' }, ca)).status, 400);
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${d}/situacao`, {}, ca)).status, 400);
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${d}/situacao`, { status: 'PAGO' }, cs)).status, 403);
  assert.strictEqual((await app.call('PUT', '/api/lancamentos/99999/situacao', { status: 'PAGO' }, ca)).status, 404);
  assert.strictEqual(await situacao(app, ca, d), 'A_PAGAR');
});
