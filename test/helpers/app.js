const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');
const db = require('../../lib/db');

process.env.SESSION_SECRET = 'segredo-de-teste';

async function criarApp() {
  const mem = newDb();
  mem.public.none(fs.readFileSync(path.join(__dirname, '../../migrations/001_init.sql'), 'utf8'));
  const { Pool } = mem.adapters.createPg();
  db.setPool(new Pool());
  const { handle } = require('../../lib/app');

  const call = (method, p, body, cookie) => handle({ method, path: p, body, headers: cookie ? { cookie } : {} });
  async function criarUsuario({ nome = 'Teste', email, senha = 'senha-de-teste', perfil = 'ADMIN' }) {
    const [u] = await db.query(
      'INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES ($1,$2,$3,$4) RETURNING id',
      [nome, email, bcrypt.hashSync(senha, 4), perfil]);
    return u.id;
  }
  async function login(email, senha = 'senha-de-teste') {
    const r = await call('POST', '/api/login', { email, senha });
    return r.headers['Set-Cookie'].split(';')[0];
  }
  return { call, criarUsuario, login, query: db.query };
}

module.exports = { criarApp };
