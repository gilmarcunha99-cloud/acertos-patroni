function vigentes(historico, ym) {
  const por = new Map();
  for (const r of historico) {
    if (r.vigente_desde > ym) continue;
    const atual = por.get(r.socio_id);
    if (!atual || r.vigente_desde > atual.vigente_desde) por.set(r.socio_id, r);
  }
  return [...por.values()]
    .filter((r) => r.bp > 0)
    .map((r) => ({ socio_id: r.socio_id, bp: r.bp }))
    .sort((a, b) => a.socio_id - b.socio_id);
}

function somaValida(itens) {
  return itens.reduce((s, i) => s + i.bp, 0) === 10000;
}

module.exports = { vigentes, somaValida };
