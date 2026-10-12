const { query } = require('./db');
const { userIdFrom } = require('./auth');
const routes = [];

function add(method, path, opts, fn) {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, role: opts.role, fn });
}

const ok = (json, status = 200) => ({ status, json });
function fail(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  throw e;
}

async function handle({ method, path, headers = {}, body }) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (!m) continue;
    try {
      const params = {};
      try { r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); }
      catch (e) { if (e instanceof URIError) fail(400, 'Endereço inválido.'); throw e; }
      let user = null;
      if (r.role !== 'PUBLIC') {
        const id = userIdFrom(headers);
        const [u] = id ? await query('SELECT id, nome, perfil, ativo FROM usuario WHERE id = $1', [id]) : [];
        if (!u || !u.ativo) return { status: 401, json: { erro: 'Faça login para continuar.' } };
        user = { id: u.id, nome: u.nome, perfil: u.perfil };
        if (r.role === 'ADMIN' && u.perfil !== 'ADMIN') return { status: 403, json: { erro: 'Somente o administrador pode fazer isso.' } };
      }
      for (const k of ['id', 'socioId']) {
        if (params[k] !== undefined && (!/^\d{1,10}$/.test(params[k]) || Number(params[k]) > 2147483647)) fail(404, 'Registro não encontrado.');
      }
      return await r.fn({ params, body: body || {}, user, headers });
    } catch (e) {
      if (e.status) return { status: e.status, json: { erro: e.message } };
      console.error(e);
      return { status: 500, json: { erro: 'Erro interno. Tente de novo.' } };
    }
  }
  return { status: 404, json: { erro: 'Rota não encontrada.' } };
}

module.exports = { add, handle, ok, fail };
