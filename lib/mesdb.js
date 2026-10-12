const { query } = require('./db');
const { montarVisao } = require('./visao');

async function carregarVisao(ym, q = query) {
  const [mes] = await q('SELECT ym, status, saldo_inicial_centavos FROM mes WHERE ym = $1', [ym]);
  if (!mes) return null;
  const [lancamentos, socios, historico, aportes] = await Promise.all([
    q('SELECT * FROM lancamento WHERE ym = $1', [ym]),
    q('SELECT id, nome FROM socio'),
    q('SELECT socio_id, vigente_desde, bp FROM socio_percentual'),
    q('SELECT * FROM aporte WHERE ym = $1', [ym]),
  ]);
  return montarVisao({ mes, lancamentos, socios, historico, aportes });
}

module.exports = { carregarVisao };
