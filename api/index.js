const { handle } = require('../lib/app');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const r = await handle({ method: req.method, path: url.pathname, headers: req.headers, body: req.body });
  Object.entries(r.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.status(r.status).json(r.json);
};
