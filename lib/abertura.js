const { moverParaMes } = require('./datas');

function proximosLancamentos(anteriores, novoYm) {
  const saida = [];
  for (const l of anteriores) {
    if (l.recorrencia === 'NENHUMA') continue;
    let atual = l.parcela_atual;
    if (l.recorrencia === 'PARCELADO') {
      if (atual >= l.parcela_total) continue;
      atual += 1;
    }
    saida.push({
      tipo: l.tipo,
      descritivo: l.descritivo,
      valor_centavos: l.valor_centavos,
      vencimento: moverParaMes(l.vencimento, novoYm),
      forma: l.forma,
      status: l.tipo === 'DEBITO' ? 'A_PAGAR' : 'A_RECEBER',
      recorrencia: l.recorrencia,
      parcela_atual: atual,
      parcela_total: l.parcela_total,
    });
  }
  return saida;
}

module.exports = { proximosLancamentos };
