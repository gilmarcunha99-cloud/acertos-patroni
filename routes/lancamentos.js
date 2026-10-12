const { add, ok, fail } = require('../lib/router');
const { query } = require('../lib/db');
const { lancamentoValido, situacaoValida } = require('../lib/validacao');

async function mesAberto(ym) {
  const [m] = await query('SELECT status FROM mes WHERE ym = $1', [ym]);
  if (!m) fail(404, 'Mês não encontrado.');
  if (m.status === 'FECHADO') fail(409, 'Mês fechado. Reabra para editar.');
}

add('POST', '/api/meses/:ym/lancamentos', { role: 'ADMIN' }, async ({ params, body }) => {
  await mesAberto(params.ym);
  const l = lancamentoValido(body);
  const [o] = await query('SELECT COALESCE(max(ordem), 0) + 1 AS ordem FROM lancamento WHERE ym = $1', [params.ym]);
  const [r] = await query(
    `INSERT INTO lancamento (ym, tipo, descritivo, valor_centavos, vencimento, forma, status, ordem, recorrencia, parcela_atual, parcela_total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [params.ym, l.tipo, l.descritivo, l.valor_centavos, l.vencimento, l.forma, l.status, o.ordem, l.recorrencia, l.parcela_atual, l.parcela_total]);
  return ok({ id: r.id }, 201);
});

async function doLancamento(id) {
  const [l] = await query('SELECT id, ym FROM lancamento WHERE id = $1', [Number(id)]);
  if (!l) fail(404, 'Lançamento não encontrado.');
  await mesAberto(l.ym);
  return l;
}

add('PUT', '/api/lancamentos/:id', { role: 'ADMIN' }, async ({ params, body }) => {
  const l0 = await doLancamento(params.id);
  const l = lancamentoValido(body);
  await query(
    `UPDATE lancamento SET tipo=$1, descritivo=$2, valor_centavos=$3, vencimento=$4, forma=$5, status=$6,
            recorrencia=$7, parcela_atual=$8, parcela_total=$9 WHERE id=$10`,
    [l.tipo, l.descritivo, l.valor_centavos, l.vencimento, l.forma, l.status, l.recorrencia, l.parcela_atual, l.parcela_total, l0.id]);
  return ok({ ok: true });
});

// Pagar (ou desfazer) vale também em mês fechado: boleto e guia costumam ser
// pagos depois do fechamento. Só a situação muda; valor, data e saldo ficam.
add('PUT', '/api/lancamentos/:id/situacao', { role: 'ADMIN' }, async ({ params, body }) => {
  const [l] = await query('SELECT id, tipo FROM lancamento WHERE id = $1', [Number(params.id)]);
  if (!l) fail(404, 'Lançamento não encontrado.');
  if (!situacaoValida(l.tipo, body.status)) fail(400, 'Situação inválida para este tipo.');
  await query('UPDATE lancamento SET status = $1 WHERE id = $2', [body.status, l.id]);
  return ok({ ok: true });
});

add('DELETE', '/api/lancamentos/:id', { role: 'ADMIN' }, async ({ params }) => {
  const l = await doLancamento(params.id);
  await query('DELETE FROM lancamento WHERE id = $1', [l.id]);
  return ok({ ok: true });
});
