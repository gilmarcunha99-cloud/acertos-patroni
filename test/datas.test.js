const test = require('node:test');
const assert = require('node:assert');
const { proximoYm, moverParaMes } = require('../lib/datas');
test('proximoYm', () => {
  assert.strictEqual(proximoYm('2026-10'), '2026-11');
  assert.strictEqual(proximoYm('2026-12'), '2027-01');
});
test('moverParaMes mantém o dia e limita ao fim do mês', () => {
  assert.strictEqual(moverParaMes('2026-10-15', '2026-11'), '2026-11-15');
  assert.strictEqual(moverParaMes('2026-10-31', '2026-11'), '2026-11-30');
  assert.strictEqual(moverParaMes('2026-12-31', '2027-02'), '2027-02-28');
  assert.strictEqual(moverParaMes('2027-12-31', '2028-02'), '2028-02-29');
});
