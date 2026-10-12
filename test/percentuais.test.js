const test = require('node:test');
const assert = require('node:assert');
const { vigentes, somaValida } = require('../lib/percentuais');
const h = [
  { socio_id: 1, vigente_desde: '2026-01', bp: 2500 },
  { socio_id: 2, vigente_desde: '2026-01', bp: 3000 },
  { socio_id: 3, vigente_desde: '2026-01', bp: 2500 },
  { socio_id: 4, vigente_desde: '2026-01', bp: 2000 },
  { socio_id: 2, vigente_desde: '2026-12', bp: 3500 },
  { socio_id: 4, vigente_desde: '2026-12', bp: 1500 },
];
test('vigentes escolhe a última vigência até o mês', () => {
  assert.deepStrictEqual(vigentes(h, '2026-10').map((x) => x.bp), [2500, 3000, 2500, 2000]);
  assert.deepStrictEqual(vigentes(h, '2026-12').map((x) => x.bp), [2500, 3500, 2500, 1500]);
});
test('vigentes descarta bp 0 (sócio que saiu)', () => {
  const r = vigentes([...h, { socio_id: 4, vigente_desde: '2027-01', bp: 0 }, { socio_id: 1, vigente_desde: '2027-01', bp: 4000 }], '2027-01');
  assert.strictEqual(r.find((x) => x.socio_id === 4), undefined);
});
test('somaValida', () => {
  assert.ok(somaValida([{ bp: 2500 }, { bp: 3000 }, { bp: 2500 }, { bp: 2000 }]));
  assert.ok(!somaValida([{ bp: 2500 }, { bp: 3000 }]));
});
