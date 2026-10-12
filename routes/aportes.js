const { add, ok, fail } = require('../lib/router');
const { query, tx } = require('../lib/db');
const { carregarVisao } = require('../lib/mesdb');
const { ymValido, centavosValido } = require('../lib/validacao');
const { vigentes, somaValida } = require('../lib/percentuais');

add('PUT', '/api/meses/:ym/aportes/:socioId', { role: 'ADMIN' }, async ({ params, body }) => {
  const [m] = await query('SELECT status FROM mes WHERE ym = $1', [params.ym]);
  if (!m) fail(404, 'Mês não encontrado.');
  const socioId = Number(params.socioId);
  const mexeAjuste = ['ajuste_centavos', 'ajuste_motivo', 'ajuste_origem'].some((k) => body[k] !== undefined);

  if (m.status === 'FECHADO') {
    if (mexeAjuste) fail(409, 'Mês fechado. Reabra para alterar o acerto.');
    if (!['PENDENTE', 'PAGO'].includes(body.status)) fail(400, 'Situação inválida.');
    const r = await query('UPDATE aporte SET status = $1 WHERE ym = $2 AND socio_id = $3 RETURNING socio_id', [body.status, params.ym, socioId]);
    if (!r.length) fail(404, 'Aporte não encontrado.');
    return ok({ ok: true });
  }

  if (body.status !== undefined) fail(409, 'O aporte só pode ser marcado como pago depois de fechar o mês.');
  const ajuste = body.ajuste_centavos === undefined ? 0 : body.ajuste_centavos;
  if (!Number.isInteger(ajuste)) fail(400, 'Informe um valor válido para o acerto.');
  if (!centavosValido(ajuste)) fail(400, 'Valor fora do limite.');
  if (ajuste !== 0) {
    if (!String(body.ajuste_motivo || '').trim()) fail(400, 'Informe o motivo do acerto.');
    if (!ymValido(body.ajuste_origem)) fail(400, 'Informe o mês de origem do acerto (AAAA-MM).');
  }
  await query(
    `INSERT INTO aporte (ym, socio_id, ajuste_centavos, ajuste_motivo, ajuste_origem) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (ym, socio_id) DO UPDATE SET ajuste_centavos = $3, ajuste_motivo = $4, ajuste_origem = $5`,
    [params.ym, socioId, ajuste, ajuste ? body.ajuste_motivo.trim() : null, ajuste ? body.ajuste_origem : null]);
  return ok({ ok: true });
});

add('POST', '/api/meses/:ym/fechar', { role: 'ADMIN' }, async ({ params, body }) => {
  const [m] = await query('SELECT status FROM mes WHERE ym = $1', [params.ym]);
  if (!m) fail(404, 'Mês não encontrado.');
  if (m.status === 'FECHADO') fail(409, 'Esse mês já está fechado.');
  const hist = await query('SELECT socio_id, vigente_desde, bp FROM socio_percentual');
  if (!somaValida(vigentes(hist, params.ym))) fail(409, 'Defina os percentuais dos sócios para este mês.');
  const v = await carregarVisao(params.ym);
  if (v.totais.diferenca !== 0 && body.confirmar_diferenca !== true) {
    return { status: 409, json: {
      erro: 'A soma dos aportes não bate com o valor a cobrir. Confirme para fechar assim mesmo.',
      diferenca_centavos: v.totais.diferenca } };
  }
  const venc = body.vencimento_aportes || `${params.ym}-15`;
  await tx(async (q) => {
    for (const a of v.aportes) {
      await q(
        `INSERT INTO aporte (ym, socio_id, bp, base_centavos, ajuste_centavos, ajuste_motivo, ajuste_origem, final_centavos, vencimento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (ym, socio_id) DO UPDATE SET bp=$3, base_centavos=$4, ajuste_centavos=$5, ajuste_motivo=$6,
           ajuste_origem=$7, final_centavos=$8, vencimento=$9`,
        [params.ym, a.socio_id, a.bp, a.base_centavos, a.ajuste_centavos, a.ajuste_motivo, a.ajuste_origem, a.final_centavos, venc]);
    }
    await q("UPDATE mes SET status = 'FECHADO' WHERE ym = $1", [params.ym]);
  });
  return ok({ ok: true });
});

add('POST', '/api/meses/:ym/reabrir', { role: 'ADMIN' }, async ({ params }) => {
  const [m] = await query('SELECT status FROM mes WHERE ym = $1', [params.ym]);
  if (!m) fail(404, 'Mês não encontrado.');
  if (m.status !== 'FECHADO') fail(409, 'Esse mês já está aberto.');
  const [pos] = await query('SELECT 1 FROM mes WHERE ym > $1 LIMIT 1', [params.ym]);
  if (pos) fail(409, 'Só dá para reabrir o mês mais recente.');
  await tx(async (q) => {
    await q('UPDATE aporte SET bp = NULL, base_centavos = NULL, final_centavos = NULL, vencimento = NULL WHERE ym = $1', [params.ym]);
    await q("UPDATE mes SET status = 'ABERTO' WHERE ym = $1", [params.ym]);
  });
  return ok({ ok: true });
});
