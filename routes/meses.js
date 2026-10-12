const { add, ok, fail } = require('../lib/router');
const { query, tx } = require('../lib/db');
const { carregarVisao } = require('../lib/mesdb');
const { proximoYm } = require('../lib/datas');
const { proximosLancamentos } = require('../lib/abertura');
const { ymValido, centavosValido } = require('../lib/validacao');

add('GET', '/api/meses', { role: 'AUTH' }, async () => {
  const meses = await query('SELECT ym, status, saldo_inicial_centavos FROM mes ORDER BY ym DESC');
  const deb = await query("SELECT ym, sum(valor_centavos) AS total FROM lancamento WHERE tipo = 'DEBITO' GROUP BY ym");
  const porMes = new Map(deb.map((d) => [d.ym, Number(d.total)]));
  return ok(meses.map((m) => ({ ...m, debitos: porMes.get(m.ym) || 0 })));
});

add('GET', '/api/meses/:ym', { role: 'AUTH' }, async ({ params }) => {
  const v = await carregarVisao(params.ym);
  if (!v) fail(404, 'Mês não encontrado.');
  return ok(v);
});

add('POST', '/api/meses/abrir', { role: 'ADMIN' }, async ({ body }) => {
  if (!ymValido(body.ym)) fail(400, 'Informe o mês (AAAA-MM).');
  const [existe] = await query('SELECT 1 FROM mes WHERE ym = $1', [body.ym]);
  if (existe) fail(409, 'Esse mês já foi aberto.');
  const [ult] = await query('SELECT ym, status FROM mes ORDER BY ym DESC LIMIT 1');
  let saldoInicial; let copiar = [];
  if (!ult) {
    if (!Number.isInteger(body.saldo_inicial_centavos)) fail(400, 'Informe o saldo inicial do banco.');
    if (!centavosValido(body.saldo_inicial_centavos)) fail(400, 'Valor fora do limite.');
    saldoInicial = body.saldo_inicial_centavos;
  } else {
    if (ult.status !== 'FECHADO') fail(409, 'Feche o mês anterior antes de abrir o próximo.');
    if (body.ym !== proximoYm(ult.ym)) fail(400, `O próximo mês é ${proximoYm(ult.ym)}.`);
    const anterior = await carregarVisao(ult.ym);
    saldoInicial = anterior.totais.saldo_final;
    copiar = proximosLancamentos(anterior.lancamentos, body.ym);
  }
  await tx(async (q) => {
    await q('INSERT INTO mes (ym, saldo_inicial_centavos) VALUES ($1, $2)', [body.ym, saldoInicial]);
    let ordem = 0;
    for (const l of copiar) {
      ordem += 1;
      await q(`INSERT INTO lancamento (ym, tipo, descritivo, valor_centavos, vencimento, forma, status, ordem, recorrencia, parcela_atual, parcela_total)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [body.ym, l.tipo, l.descritivo, l.valor_centavos, l.vencimento, l.forma, l.status, ordem, l.recorrencia, l.parcela_atual, l.parcela_total]);
    }
  });
  return ok({ ym: body.ym }, 201);
});

add('PUT', '/api/meses/:ym/saldo-inicial', { role: 'ADMIN' }, async ({ params, body }) => {
  const [m] = await query('SELECT status FROM mes WHERE ym = $1', [params.ym]);
  if (!m) fail(404, 'Mês não encontrado.');
  if (m.status === 'FECHADO') fail(409, 'Mês fechado. Reabra para editar.');
  if (!Number.isInteger(body.saldo_inicial_centavos)) fail(400, 'Informe um valor válido.');
  if (!centavosValido(body.saldo_inicial_centavos)) fail(400, 'Valor fora do limite.');
  await query('UPDATE mes SET saldo_inicial_centavos = $1 WHERE ym = $2', [body.saldo_inicial_centavos, params.ym]);
  return ok({ ok: true });
});
