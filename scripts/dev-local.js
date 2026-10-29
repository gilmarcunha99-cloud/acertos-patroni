// Servidor de desenvolvimento local: banco pg-mem em memória, sem Neon/Vercel.
// Uso: npm run dev:local  (credenciais geradas a cada partida em .env.dev-local)
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');

const RAIZ = path.join(__dirname, '..');
const PUBLICO = path.join(RAIZ, 'public');
if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

const senhaAleatoria = () => crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, 'x').slice(0, 16);

async function preparar() {
  const mem = newDb();
  const dirMig = path.join(RAIZ, 'migrations');
  for (const f of fs.readdirSync(dirMig).filter((n) => n.endsWith('.sql')).sort()) mem.public.none(fs.readFileSync(path.join(dirMig, f), 'utf8'));
  const { Pool } = mem.adapters.createPg();
  const db = require('../lib/db');
  db.setPool(new Pool());
  const q = db.query;

  const cred = { ADMIN_EMAIL: 'admin@teste.local', ADMIN_PASSWORD: senhaAleatoria(), SOCIO_EMAIL: 'socio@teste.local', SOCIO_PASSWORD: senhaAleatoria() };
  await q('INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES ($1,$2,$3,$4)', ['Admin teste', cred.ADMIN_EMAIL, bcrypt.hashSync(cred.ADMIN_PASSWORD, 10), 'ADMIN']);
  const [su] = await q('INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES ($1,$2,$3,$4) RETURNING id', ['Sócio teste', cred.SOCIO_EMAIL, bcrypt.hashSync(cred.SOCIO_PASSWORD, 10), 'SOCIO']);

  for (const [nome, bp] of [['Adriano', 2500], ['Henrique', 3000], ['Lígia', 2500], ['Luiz', 2000]]) {
    const [s] = await q('INSERT INTO socio (nome, usuario_id) VALUES ($1,$2) RETURNING id', [nome, nome === 'Lígia' ? su.id : null]);
    await q('INSERT INTO socio_percentual (socio_id, vigente_desde, bp) VALUES ($1,$2,$3)', [s.id, '2026-10', bp]);
  }

  await q("INSERT INTO mes (ym, saldo_inicial_centavos) VALUES ('2026-10', -1623)");
  const L = [
    ['Contabilidade', 26700, '2026-10-15', 'BOLETO', 'FIXO', null, null],
    ['Condominio Boulevard Shopping', 338304, '2026-10-20', 'BOLETO', 'PARCELADO', 7, 24],
    ['ICMS', 155521, '2026-10-25', 'GUIA', 'PARCELADO', 17, 119],
    ['DASN', 30225, '2026-10-25', 'GUIA', 'PARCELADO', 2, 58],
  ];
  let ordem = 0;
  for (const [d, v, venc, forma, rec, pa, pt] of L) {
    ordem += 1;
    await q(`INSERT INTO lancamento (ym, tipo, descritivo, valor_centavos, vencimento, forma, status, ordem, recorrencia, parcela_atual, parcela_total)
             VALUES ('2026-10','DEBITO',$1,$2,$3,$4,'A_PAGAR',$5,$6,$7,$8)`, [d, v, venc, forma, ordem, rec, pa, pt]);
  }

  fs.writeFileSync(path.join(RAIZ, '.env.dev-local'), Object.entries(cred).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => {
      const txt = Buffer.concat(partes).toString('utf8');
      if (!txt) return resolve(undefined);
      try { resolve(JSON.parse(txt)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function estatico(res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return json(res, 404, { erro: 'Não encontrado.' }); }
  if (rel === '/') rel = '/index.html';
  const arquivo = path.resolve(PUBLICO, '.' + rel);
  if (arquivo !== PUBLICO && !arquivo.startsWith(PUBLICO + path.sep)) return json(res, 404, { erro: 'Não encontrado.' });
  fs.readFile(arquivo, (err, dados) => {
    if (err) return json(res, 404, { erro: 'Não encontrado.' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arquivo).toLowerCase()] || 'application/octet-stream' });
    res.end(dados);
  });
}

async function main() {
  await preparar();
  const { handle } = require('../lib/app');
  const servidor = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        let body;
        try { body = await lerCorpo(req); } catch { return json(res, 400, { erro: 'Corpo inválido.' }); }
        const r = await handle({ method: req.method, path: url.pathname, headers: req.headers, body });
        for (const [k, v] of Object.entries(r.headers || {})) {
          if (k.toLowerCase() === 'set-cookie') {
            const limpo = (c) => String(c).replace(/;\s*Secure\b/gi, '');
            res.setHeader(k, Array.isArray(v) ? v.map(limpo) : limpo(v));
          } else res.setHeader(k, v);
        }
        res.statusCode = r.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify(r.json));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 404, { erro: 'Não encontrado.' });
      estatico(res, url.pathname);
    } catch (e) {
      console.error(e);
      json(res, 500, { erro: 'Erro interno.' });
    }
  });
  const porta = Number(process.env.PORT) || 3000;
  servidor.listen(porta, '127.0.0.1', () => {
    console.log(`Servidor local em http://127.0.0.1:${porta} (banco em memória; credenciais em .env.dev-local)`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
