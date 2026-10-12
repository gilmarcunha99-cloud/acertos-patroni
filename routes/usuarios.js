const bcrypt = require('bcryptjs');
const { add, ok, fail } = require('../lib/router');
const { query } = require('../lib/db');

const PERFIS = ['ADMIN', 'SOCIO'];

function validar(b, { criando }) {
  if (criando || b.nome !== undefined) if (!String(b.nome || '').trim()) fail(400, 'Informe o nome.');
  if (criando || b.email !== undefined) if (!/^\S{2,80}$/.test(String(b.email || '').trim())) fail(400, 'Informe o login (e-mail ou nome de usuário, sem espaços).');
  if (criando || b.perfil !== undefined) if (!PERFIS.includes(b.perfil)) fail(400, 'Perfil inválido.');
  if (criando || b.senha !== undefined) if (String(b.senha || '').length < 8) fail(400, 'A senha precisa ter ao menos 8 caracteres.');
}

async function outrosAdminsAtivos(id) {
  const [r] = await query("SELECT count(*)::int AS n FROM usuario WHERE perfil = 'ADMIN' AND ativo AND id <> $1", [id]);
  return r.n;
}

async function protegerUltimoAdmin(id, alvoDepois) {
  const [u] = await query('SELECT perfil, ativo FROM usuario WHERE id = $1', [id]);
  if (!u) fail(404, 'Usuário não encontrado.');
  const eraAdminAtivo = u.perfil === 'ADMIN' && u.ativo;
  const seraAdminAtivo = alvoDepois.perfil === 'ADMIN' && alvoDepois.ativo;
  if (eraAdminAtivo && !seraAdminAtivo && (await outrosAdminsAtivos(id)) === 0) {
    fail(409, 'Este é o único administrador ativo. Cadastre outro antes.');
  }
}

async function emailLivre(email, exceto) {
  const r = await query('SELECT id FROM usuario WHERE lower(email) = lower($1) AND id <> $2', [email, exceto || 0]);
  if (r.length) fail(409, 'Já existe um usuário com esse login.');
}

async function gravar(sql, params) {
  try { return await query(sql, params); } catch (e) {
    if (/unique|duplicate/i.test(e.message)) fail(409, 'Já existe um usuário com esse login.');
    throw e;
  }
}

add('GET', '/api/usuarios', { role: 'ADMIN' }, async () =>
  ok(await query('SELECT id, nome, email, perfil, ativo FROM usuario ORDER BY nome')));

add('POST', '/api/usuarios', { role: 'ADMIN' }, async ({ body }) => {
  validar(body, { criando: true });
  await emailLivre(body.email.trim());
  const [u] = await gravar(
    'INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, $4) RETURNING id',
    [body.nome.trim(), body.email.trim(), bcrypt.hashSync(body.senha, 10), body.perfil]);
  return ok({ id: u.id }, 201);
});

add('PUT', '/api/usuarios/:id', { role: 'ADMIN' }, async ({ params, body }) => {
  const id = Number(params.id);
  validar(body, { criando: false });
  const [u] = await query('SELECT * FROM usuario WHERE id = $1', [id]);
  if (!u) fail(404, 'Usuário não encontrado.');
  const perfil = body.perfil !== undefined ? body.perfil : u.perfil;
  const ativo = body.ativo !== undefined ? !!body.ativo : u.ativo;
  await protegerUltimoAdmin(id, { perfil, ativo });
  if (body.email !== undefined) await emailLivre(body.email.trim(), id);
  const senhaHash = body.senha !== undefined ? bcrypt.hashSync(body.senha, 10) : u.senha_hash;
  await gravar('UPDATE usuario SET nome = $1, email = $2, perfil = $3, ativo = $4, senha_hash = $5 WHERE id = $6',
    [body.nome !== undefined ? body.nome.trim() : u.nome, body.email !== undefined ? body.email.trim() : u.email, perfil, ativo, senhaHash, id]);
  return ok({ ok: true });
});

add('DELETE', '/api/usuarios/:id', { role: 'ADMIN' }, async ({ params }) => {
  const id = Number(params.id);
  await protegerUltimoAdmin(id, { perfil: null, ativo: false });
  const [v] = await query('SELECT count(*)::int AS n FROM socio WHERE usuario_id = $1', [id]);
  if (v.n > 0) {
    await query('UPDATE usuario SET ativo = false WHERE id = $1', [id]);
    return ok({ inativado: true });
  }
  await query('DELETE FROM usuario WHERE id = $1', [id]);
  return ok({ excluido: true });
});
