const { handle } = require('../lib/app');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(req.url, 'http://x');
    let body = req.body;
    if (typeof body === 'string') body = body.trim() ? JSON.parse(body) : {};
    const r = await handle({ method: req.method, path: url.pathname, headers: req.headers, body });
    Object.entries(r.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    res.status(r.status).json(r.json);
  } catch (e) {
    const invalido = e instanceof SyntaxError || e instanceof URIError;
    if (!invalido) console.error(e);
    if (res.headersSent) return;
    res.status(invalido ? 400 : 500).json({ erro: invalido ? 'Requisição inválida.' : 'Erro interno. Tente de novo.' });
  }
};
