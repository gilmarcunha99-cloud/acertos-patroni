const test = require('node:test');
const assert = require('node:assert');
const { saldoCorrido } = require('../lib/saldo');
test('saldo corrido de outubro/26 (planilha)', () => {
  const s = saldoCorrido(-1623, [
    { tipo: 'DEBITO', valor_centavos: 26700 },
    { tipo: 'DEBITO', valor_centavos: 338304 },
    { tipo: 'DEBITO', valor_centavos: 155521 },
    { tipo: 'DEBITO', valor_centavos: 30225 },
    { tipo: 'CREDITO', valor_centavos: 145244 },
  ]);
  assert.deepStrictEqual(s, [-28323, -366627, -522148, -552373, -407129]);
});
