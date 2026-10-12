const test = require('node:test');
const assert = require('node:assert');
const { proximosLancamentos } = require('../lib/abertura');

const base = (o) => ({ tipo: 'DEBITO', descritivo: 'X', valor_centavos: 100, vencimento: '2026-10-25', forma: 'GUIA',
  status: 'PAGO', recorrencia: 'NENHUMA', parcela_atual: null, parcela_total: null, ...o });

test('copia FIXO sem mudar parcela e reabre como a pagar', () => {
  const r = proximosLancamentos([base({ descritivo: 'Contabilidade', recorrencia: 'FIXO', vencimento: '2026-10-15' })], '2026-11');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].vencimento, '2026-11-15');
  assert.strictEqual(r[0].status, 'A_PAGAR');
  assert.strictEqual(r[0].parcela_atual, null);
});
test('PARCELADO avança a parcela', () => {
  const r = proximosLancamentos([base({ descritivo: 'ICMS', recorrencia: 'PARCELADO', parcela_atual: 17, parcela_total: 119, valor_centavos: 155521 })], '2026-11');
  assert.strictEqual(r[0].parcela_atual, 18);
  assert.strictEqual(r[0].parcela_total, 119);
  assert.strictEqual(r[0].valor_centavos, 155521);
});
test('PARCELADO na última parcela some', () => {
  assert.strictEqual(proximosLancamentos([base({ recorrencia: 'PARCELADO', parcela_atual: 58, parcela_total: 58 })], '2026-11').length, 0);
});
test('NENHUMA não é copiado', () => {
  assert.strictEqual(proximosLancamentos([base({})], '2026-11').length, 0);
});
test('crédito fixo reabre como a receber', () => {
  const r = proximosLancamentos([base({ tipo: 'CREDITO', recorrencia: 'FIXO', status: 'RECEBIDO' })], '2026-11');
  assert.strictEqual(r[0].status, 'A_RECEBER');
});
