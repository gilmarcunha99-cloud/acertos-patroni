const { saldoCorrido } = require('./saldo');
const { vigentes } = require('./percentuais');
const { valorACobrir, calcularAportes } = require('./aportes');

function montarVisao({ mes, lancamentos, socios, historico, aportes }) {
  const ordenados = [...lancamentos].sort(
    (a, b) => a.vencimento.localeCompare(b.vencimento) || a.ordem - b.ordem || a.id - b.id);
  const soma = (t) => ordenados.filter((l) => l.tipo === t).reduce((s, l) => s + l.valor_centavos, 0);
  const debitos = soma('DEBITO');
  const creditosAvulsos = soma('CREDITO');
  const aCobrir = valorACobrir({ debitos, creditosAvulsos, saldoInicial: mes.saldo_inicial_centavos });
  const nome = (id) => (socios.find((s) => s.id === id) || {}).nome || '';
  const fechado = mes.status === 'FECHADO';

  let linhas;
  if (fechado) {
    linhas = aportes.filter((a) => a.final_centavos !== null && a.final_centavos !== undefined).map((a) => ({ ...a }));
  } else {
    const porSocio = new Map(aportes.map((a) => [a.socio_id, a]));
    const ajustes = {};
    aportes.forEach((a) => { ajustes[a.socio_id] = a.ajuste_centavos || 0; });
    linhas = calcularAportes({ aCobrir, itens: vigentes(historico, mes.ym), ajustes }).map((c) => {
      const a = porSocio.get(c.socio_id) || {};
      return { ...c, ajuste_motivo: a.ajuste_motivo || null, ajuste_origem: a.ajuste_origem || null,
        status: a.status || 'PENDENTE', vencimento: `${mes.ym}-15` };
    });
  }
  linhas = linhas.map((a) => ({ ...a, nome: nome(a.socio_id) })).sort((a, b) => a.socio_id - b.socio_id);

  const corridas = [...ordenados, ...linhas.map((a) => ({ tipo: 'CREDITO', valor_centavos: a.final_centavos }))];
  const saldos = saldoCorrido(mes.saldo_inicial_centavos, corridas);
  const totalAportes = linhas.reduce((s, a) => s + a.final_centavos, 0);

  return {
    ym: mes.ym,
    status: mes.status,
    provisorio: !fechado,
    saldo_inicial_centavos: mes.saldo_inicial_centavos,
    lancamentos: ordenados.map((l, i) => ({ ...l, saldo_centavos: saldos[i] })),
    aportes: linhas.map((a, i) => ({ ...a, saldo_centavos: saldos[ordenados.length + i] })),
    totais: {
      debitos, creditos_avulsos: creditosAvulsos, a_cobrir: aCobrir, aportes: totalAportes,
      diferenca: totalAportes - aCobrir,
      saldo_final: saldos.length ? saldos[saldos.length - 1] : mes.saldo_inicial_centavos,
    },
  };
}

module.exports = { montarVisao };
