const test = require('node:test');
const assert = require('node:assert');
const { montarVisao } = require('../lib/visao');

const socios = [{ id: 1, nome: 'Adriano' }, { id: 2, nome: 'Henrique' }, { id: 3, nome: 'Lígia' }, { id: 4, nome: 'Luiz' }];
const historico = [[1, 2500], [2, 3000], [3, 2500], [4, 2000]].map(([s, bp]) => ({ socio_id: s, vigente_desde: '2026-10', bp }));
const L = (id, descritivo, valor, venc) => ({ id, tipo: 'DEBITO', descritivo, valor_centavos: valor, vencimento: venc, ordem: id, status: 'A_PAGAR', forma: 'BOLETO' });
const lancamentos = [
  L(3, 'ICMS', 155521, '2026-10-25'), L(1, 'Contabilidade', 26700, '2026-10-15'),
  L(2, 'Condominio', 338304, '2026-10-20'), L(4, 'DASN', 30225, '2026-10-25'),
];
const mes = { ym: '2026-10', status: 'ABERTO', saldo_inicial_centavos: -1623 };

test('outubro/26 aberto: ordem, totais e saldo final zero', () => {
  const v = montarVisao({ mes, lancamentos, socios, historico, aportes: [] });
  assert.deepStrictEqual(v.lancamentos.map((l) => l.descritivo), ['Contabilidade', 'Condominio', 'ICMS', 'DASN']);
  assert.deepStrictEqual(v.lancamentos.map((l) => l.saldo_centavos), [-28323, -366627, -522148, -552373]);
  assert.strictEqual(v.totais.debitos, 550750);
  assert.strictEqual(v.totais.a_cobrir, 552373);
  assert.strictEqual(v.totais.aportes, 552373);
  assert.strictEqual(v.totais.diferenca, 0);
  assert.strictEqual(v.totais.saldo_final, 0);
  assert.strictEqual(v.provisorio, true);
  assert.strictEqual(v.aportes[0].nome, 'Adriano');
  assert.strictEqual(v.aportes[0].vencimento, '2026-10-15');
});

test('ajuste aberto aparece e gera diferença', () => {
  const aportes = [{ socio_id: 3, ajuste_centavos: -30225, ajuste_motivo: 'acerto set', ajuste_origem: '2026-09', status: 'PENDENTE' }];
  const v = montarVisao({ mes, lancamentos, socios, historico, aportes });
  assert.strictEqual(v.aportes[2].final_centavos, 107868);
  assert.strictEqual(v.aportes[2].ajuste_motivo, 'acerto set');
  assert.strictEqual(v.totais.diferenca, -30225);
});

test('mês fechado usa aportes congelados', () => {
  const aportes = [{ socio_id: 1, bp: 2500, base_centavos: 100, ajuste_centavos: 0, final_centavos: 100, status: 'PAGO', vencimento: '2026-10-15', ajuste_motivo: null, ajuste_origem: null }];
  const v = montarVisao({ mes: { ...mes, status: 'FECHADO' }, lancamentos, socios, historico, aportes });
  assert.strictEqual(v.provisorio, false);
  assert.strictEqual(v.aportes.length, 1);
  assert.strictEqual(v.aportes[0].status, 'PAGO');
  assert.strictEqual(v.aportes[0].nome, 'Adriano');
});
