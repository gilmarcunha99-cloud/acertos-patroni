// Entrada por digital (passkey / WebAuthn). A verificação criptográfica fica em
// lib/webauthn.js (trazida do Condo·OS); aqui ficam o desafio de uso único, a
// credencial guardada e a sessão, que é a mesma do login com senha.
const { add, ok, fail } = require('../lib/router');
const { query } = require('../lib/db');
const { cookieFor } = require('../lib/auth');
const W = require('../lib/webauthn');

const MSG_ENTRADA = 'Não foi possível entrar com a digital. Entre com login e senha.';
const MSG_ATIVAR = 'Não foi possível ativar a digital. Tente de novo.';

function origem(headers) {
  const o = W.origemDoPedido(headers, { naVercel: Boolean(process.env.VERCEL), rpIdsPermitidos: W.listaDeRpIds(process.env.APP_RP_IDS) });
  if (!o) fail(400, 'A digital só funciona no endereço https do app.');
  return o;
}

async function guardarDesafio(tipo, usuarioId) {
  const agora = new Date().toISOString();
  await query('DELETE FROM webauthn_desafio WHERE expira_em < $1', [agora]);
  const desafio = W.novoDesafio();
  await query('INSERT INTO webauthn_desafio (desafio, tipo, usuario_id, expira_em) VALUES ($1, $2, $3, $4)',
    [desafio, tipo, usuarioId, W.expiracaoDoDesafio(agora)]);
  return desafio;
}

// Acha e gasta o desafio (uso único). Nulo se não existe, é de outro tipo ou
// usuário, ou já venceu.
async function gastarDesafio(clientDataJSON, tipo, usuarioId) {
  const desafio = W.desafioDoClientData(clientDataJSON);
  if (!desafio) return null;
  const [d] = await query('DELETE FROM webauthn_desafio WHERE desafio = $1 AND tipo = $2 RETURNING usuario_id, expira_em', [desafio, tipo]);
  if (!d || d.expira_em < new Date().toISOString()) return null;
  if (tipo === 'REGISTRO' && d.usuario_id !== usuarioId) return null;
  return desafio;
}

add('POST', '/api/passkey/registro/opcoes', { role: 'AUTH' }, async ({ headers, user }) => {
  const { rpId } = origem(headers);
  const [u] = await query('SELECT id, nome, email FROM usuario WHERE id = $1', [user.id]);
  const existentes = (await query('SELECT credencial_id FROM passkey WHERE usuario_id = $1', [user.id])).map((r) => r.credencial_id);
  const desafio = await guardarDesafio('REGISTRO', user.id);
  return ok(W.opcoesDeRegistro({ desafio, rpId, usuario: { usuario_id: u.id, nome: u.nome, email: u.email }, credenciaisExistentes: existentes }));
});

add('POST', '/api/passkey/registro', { role: 'AUTH' }, async ({ headers, user, body }) => {
  const o = origem(headers);
  const desafio = await gastarDesafio(body.clientDataJSON, 'REGISTRO', user.id);
  if (!desafio) fail(400, MSG_ATIVAR);
  let r;
  try {
    r = W.verificarRegistro({ clientDataJSON: body.clientDataJSON, attestationObject: body.attestationObject, desafio, origem: o.origem, rpId: o.rpId });
  } catch (e) {
    if (e instanceof W.ErroWebauthn) { console.warn(e.message); fail(400, MSG_ATIVAR); }
    throw e;
  }
  const [ja] = await query('SELECT 1 FROM passkey WHERE credencial_id = $1', [r.credencialId]);
  if (ja) fail(409, 'Esta digital já está ativada.');
  const aparelho = String(body.aparelho || '').slice(0, 80) || null;
  const [p] = await query(
    'INSERT INTO passkey (credencial_id, usuario_id, chave_jwk, contador, aparelho, criada_em) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [r.credencialId, user.id, JSON.stringify(r.chavePublicaJwk), r.contador, aparelho, new Date().toISOString()]);
  return ok({ id: p.id, credencial_id: r.credencialId }, 201);
});

add('POST', '/api/passkey/entrada/opcoes', { role: 'PUBLIC' }, async ({ headers }) => {
  const { rpId } = origem(headers);
  return ok(W.opcoesDeEntrada({ desafio: await guardarDesafio('ENTRADA', null), rpId }));
});

add('POST', '/api/passkey/entrada', { role: 'PUBLIC' }, async ({ headers, body }) => {
  const o = origem(headers);
  const desafio = await gastarDesafio(body.clientDataJSON, 'ENTRADA', null);
  if (!desafio) fail(401, MSG_ENTRADA);
  const [p] = await query(
    `SELECT p.id, p.usuario_id, p.chave_jwk, p.contador, u.nome, u.perfil
       FROM passkey p JOIN usuario u ON u.id = p.usuario_id
      WHERE p.credencial_id = $1 AND u.ativo`, [String(body.id || '')]);
  if (!p || !W.userHandleConfere(body.userHandle, p.usuario_id)) fail(401, MSG_ENTRADA);
  let r;
  try {
    r = W.verificarEntrada({
      clientDataJSON: body.clientDataJSON, authenticatorData: body.authenticatorData, signature: body.signature,
      desafio, origem: o.origem, rpId: o.rpId, chavePublicaJwk: JSON.parse(p.chave_jwk), contadorAnterior: Number(p.contador),
    });
  } catch (e) {
    if (e instanceof W.ErroWebauthn) { console.warn(e.message); fail(401, MSG_ENTRADA); }
    throw e;
  }
  await query('UPDATE passkey SET contador = $1, usada_em = $2 WHERE id = $3', [r.contador, new Date().toISOString(), p.id]);
  return { status: 200, json: { id: p.usuario_id, nome: p.nome, perfil: p.perfil }, headers: { 'Set-Cookie': cookieFor(p.usuario_id) } };
});

add('GET', '/api/passkey', { role: 'AUTH' }, async ({ user }) => ok(await query(
  'SELECT id, credencial_id, aparelho, criada_em, usada_em FROM passkey WHERE usuario_id = $1 ORDER BY id', [user.id])));

add('DELETE', '/api/passkey/:id', { role: 'AUTH' }, async ({ params, user }) => {
  const r = await query('DELETE FROM passkey WHERE id = $1 AND usuario_id = $2 RETURNING id', [Number(params.id), user.id]);
  if (!r.length) fail(404, 'Digital não encontrada.');
  return ok({ ok: true });
});
