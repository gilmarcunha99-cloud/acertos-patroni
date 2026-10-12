function valorACobrir({ debitos, creditosAvulsos, saldoInicial }) {
  return Math.max(0, debitos - creditosAvulsos - saldoInicial);
}

function calcularAportes({ aCobrir, itens, ajustes }) {
  const linhas = itens.map((it, idx) => {
    const bruto = aCobrir * it.bp;
    return { idx, socio_id: it.socio_id, bp: it.bp, base: Math.floor(bruto / 10000), resto: bruto % 10000 };
  });
  let faltam = aCobrir - linhas.reduce((s, l) => s + l.base, 0);
  [...linhas].sort((a, b) => b.resto - a.resto || a.idx - b.idx).forEach((l) => {
    if (faltam > 0) { l.base += 1; faltam -= 1; }
  });
  return linhas.map((l) => {
    const ajuste = ajustes[l.socio_id] || 0;
    return { socio_id: l.socio_id, bp: l.bp, base_centavos: l.base, ajuste_centavos: ajuste, final_centavos: l.base + ajuste };
  });
}

module.exports = { valorACobrir, calcularAportes };
