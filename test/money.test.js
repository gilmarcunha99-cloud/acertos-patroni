const test = require('node:test');
const assert = require('node:assert');
test('parseBRL e formatBRL', async () => {
  const { parseBRL, formatBRL } = await import('../public/js/money.mjs');
  assert.strictEqual(parseBRL('1.555,21'), 155521);
  assert.strictEqual(parseBRL('16,23'), 1623);
  assert.strictEqual(parseBRL('-16,23'), -1623);
  assert.strictEqual(parseBRL('1555,21'), 155521);
  assert.strictEqual(parseBRL('1,5'), 150);
  assert.strictEqual(parseBRL('267'), 26700);
  assert.strictEqual(parseBRL('abc'), null);
  assert.strictEqual(parseBRL(''), null);
  assert.strictEqual(formatBRL(155521), '1.555,21');
  assert.strictEqual(formatBRL(-1623), '-16,23');
  assert.strictEqual(formatBRL(5), '0,05');
  assert.strictEqual(formatBRL(0), '0,00');
  assert.strictEqual(formatBRL(552373), '5.523,73');
});
