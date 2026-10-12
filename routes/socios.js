const { add, ok, fail } = require('../lib/router');
const { query, tx } = require('../lib/db');
const { vigentes, somaValida } = require('../lib/percentuais');
const { ymValido } = require('../lib/validacao');

const ymAtual = () => new Date().toISOString().slice(0, 7);

add('GET', '/api/socios', { role: 'AUTH' }, async () => {
  const socios = await query('SELECT id, nome, usuario_id, ativo FROM socio ORDER BY id');
  const hist = await query('SELECT socio_id, vigente_desde, bp FROM socio_percentual ORDER BY vigente_desde');
  const hoje = vigentes(hist, ymAtual());
  return ok(socios.map((s) => ({
    ...s,
    bp_atual: (hoje.find((h) => h.socio_id === s.id) || { bp: 0 }).bp,
    historico: hist.filter((h) => h.socio_id === s.id).map((h) => ({ vigente_desde: h.vigente_desde, bp: h.bp })),
  })));
});

add('POST', '/api/socios', { role: 'ADMIN' }, async ({ body }) => {
  if (!String(body.nome || '').trim()) fail(400, 'Informe o nome do sócio.');
  const [s] = await query('INSERT INTO socio (nome, usuario_id) VALUES ($1, $2) RETURNING id', [body.nome.trim(), body.usuario_id || null]);
  return ok({ id: s.id }, 201);
});

add('PUT', '/api/socios/:id', { role: 'ADMIN' }, async ({ params, body }) => {
  const [s] = await query('SELECT * FROM socio WHERE id = $1', [Number(params.id)]);
  if (!s) fail(404, 'Sócio não encontrado.');
  await query('UPDATE socio SET nome = $1, usuario_id = $2, ativo = $3 WHERE id = $4', [
    body.nome !== undefined ? String(body.nome).trim() : s.nome,
    body.usuario_id !== undefined ? body.usuario_id : s.usuario_id,
    body.ativo !== undefined ? !!body.ativo : s.ativo, s.id]);
  return ok({ ok: true });
});

add('DELETE', '/api/socios/:id', { role: 'ADMIN' }, async ({ params }) => {
  const id = Number(params.id);
  const [h] = await query('SELECT (SELECT count(*) FROM socio_percentual WHERE socio_id = $1)::int AS p, (SELECT count(*) FROM aporte WHERE socio_id = $1)::int AS a', [id]);
  if (h.p + h.a > 0) {
    await query('UPDATE socio SET ativo = false WHERE id = $1', [id]);
    return ok({ inativado: true });
  }
  await query('DELETE FROM socio WHERE id = $1', [id]);
  return ok({ excluido: true });
});

add('POST', '/api/percentuais', { role: 'ADMIN' }, async ({ body }) => {
  if (!ymValido(body.vigente_desde)) fail(400, 'Informe o mês de início (AAAA-MM).');
  const itens = Array.isArray(body.itens) ? body.itens : [];
  if (!itens.every((i) => i && typeof i === 'object' && Number.isInteger(i.bp) && i.bp >= 0)) fail(400, 'Percentual inválido.');
  const todos = await query('SELECT id, ativo FROM socio');
  const porId = new Map(todos.map((s) => [s.id, s]));
  const ids = new Set(itens.map((i) => i.socio_id));
  if (ids.size !== itens.length) fail(400, 'Sócio repetido na lista.');
  if (itens.some((i) => !porId.has(i.socio_id))) fail(400, 'Há sócios inexistentes ou inativos na lista.');
  if (todos.some((s) => s.ativo && !ids.has(s.id))) fail(400, 'Informe o percentual de todos os sócios ativos.');
  if (itens.some((i) => !porId.get(i.socio_id).ativo && i.bp > 0)) fail(400, 'Há sócios inexistentes ou inativos na lista.');
  if (!somaValida(itens)) fail(400, 'Os percentuais precisam somar 100%.');
  const [f] = await query("SELECT max(ym) AS ym FROM mes WHERE status = 'FECHADO'");
  if (f.ym && body.vigente_desde <= f.ym) fail(409, 'Esse mês já está fechado. Escolha um mês posterior.');
  const hist = await query('SELECT socio_id, vigente_desde, bp FROM socio_percentual');
  const retirados = vigentes(hist, body.vigente_desde).filter((v) => !ids.has(v.socio_id));
  await tx(async (q) => {
    for (const r of retirados) {
      await q('DELETE FROM socio_percentual WHERE socio_id = $1 AND vigente_desde = $2', [r.socio_id, body.vigente_desde]);
      await q('INSERT INTO socio_percentual (socio_id, vigente_desde, bp) VALUES ($1, $2, 0)', [r.socio_id, body.vigente_desde]);
    }
    for (const i of itens) {
      await q('DELETE FROM socio_percentual WHERE socio_id = $1 AND vigente_desde = $2', [i.socio_id, body.vigente_desde]);
      await q('INSERT INTO socio_percentual (socio_id, vigente_desde, bp) VALUES ($1, $2, $3)', [i.socio_id, body.vigente_desde, i.bp]);
    }
  });
  return ok({ ok: true });
});
