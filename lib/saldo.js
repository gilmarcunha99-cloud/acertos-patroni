function saldoCorrido(saldoInicial, linhas) {
  let s = saldoInicial;
  return linhas.map((l) => {
    s += l.tipo === 'CREDITO' ? l.valor_centavos : -l.valor_centavos;
    return s;
  });
}
module.exports = { saldoCorrido };
