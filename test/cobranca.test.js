const test = require('node:test');
const assert = require('node:assert');
test('nomeDoMes', async () => {
  const { nomeDoMes } = await import('../public/js/cobranca.mjs');
  assert.strictEqual(nomeDoMes('2026-10'), 'outubro/26');
});
test('textoCobranca lista só pendentes', async () => {
  const { textoCobranca } = await import('../public/js/cobranca.mjs');
  const visao = { aportes: [
    { nome: 'Adriano', final_centavos: 145244, vencimento: '2026-10-15', status: 'PAGO' },
    { nome: 'Lígia', final_centavos: 115019, vencimento: '2026-10-15', status: 'PENDENTE' },
  ] };
  const t = textoCobranca(visao, '2026-10');
  assert.ok(t.includes('Lígia: R$ 1.150,19 (vence 15/10)'));
  assert.ok(!t.includes('Adriano'));
  assert.ok(t.startsWith('Aportes de outubro/26'));
});
test('textoCobranca sem pendências', async () => {
  const { textoCobranca } = await import('../public/js/cobranca.mjs');
  assert.strictEqual(textoCobranca({ aportes: [{ nome: 'A', final_centavos: 1, vencimento: '2026-10-15', status: 'PAGO' }] }, '2026-10'),
    'Aportes de outubro/26: todos recebidos.');
});
