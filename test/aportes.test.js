const test = require('node:test');
const assert = require('node:assert');
const { valorACobrir, calcularAportes } = require('../lib/aportes');
const itens = [{ socio_id: 1, bp: 2500 }, { socio_id: 2, bp: 3000 }, { socio_id: 3, bp: 2500 }, { socio_id: 4, bp: 2000 }];

test('valor a cobrir de outubro/26', () => {
  assert.strictEqual(valorACobrir({ debitos: 550750, creditosAvulsos: 0, saldoInicial: -1623 }), 552373);
});
test('saldo inicial positivo abate; nunca negativo', () => {
  assert.strictEqual(valorACobrir({ debitos: 1000, creditosAvulsos: 0, saldoInicial: 400 }), 600);
  assert.strictEqual(valorACobrir({ debitos: 1000, creditosAvulsos: 0, saldoInicial: 5000 }), 0);
});
test('rateio soma exatamente o valor a cobrir (maior resto)', () => {
  const r = calcularAportes({ aCobrir: 552373, itens, ajustes: {} });
  assert.deepStrictEqual(r.map((x) => x.base_centavos), [138093, 165712, 138093, 110475]);
  assert.strictEqual(r.reduce((s, x) => s + x.base_centavos, 0), 552373);
  assert.deepStrictEqual(r.map((x) => x.final_centavos), [138093, 165712, 138093, 110475]);
});
test('ajuste entra no final, não na base', () => {
  const r = calcularAportes({ aCobrir: 552373, itens, ajustes: { 3: -30225, 2: 1622 } });
  assert.strictEqual(r[2].base_centavos, 138093);
  assert.strictEqual(r[2].ajuste_centavos, -30225);
  assert.strictEqual(r[2].final_centavos, 107868);
  assert.strictEqual(r[1].final_centavos, 167334);
});
test('aCobrir zero devolve zeros', () => {
  assert.deepStrictEqual(calcularAportes({ aCobrir: 0, itens, ajustes: {} }).map((x) => x.final_centavos), [0, 0, 0, 0]);
});
