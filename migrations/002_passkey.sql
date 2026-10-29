-- Entrada por digital (passkey / WebAuthn). A chave privada fica no aparelho;
-- aqui ficam só a chave pública e o contador de cada credencial registrada.
CREATE TABLE passkey (
  id SERIAL PRIMARY KEY,
  credencial_id TEXT NOT NULL UNIQUE,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  chave_jwk TEXT NOT NULL,
  contador BIGINT NOT NULL DEFAULT 0,
  aparelho TEXT,
  criada_em TEXT NOT NULL,
  usada_em TEXT
);
-- Desafio de uso único: a rota apaga ao usar; vale 5 minutos.
CREATE TABLE webauthn_desafio (
  desafio TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('REGISTRO','ENTRADA')),
  usuario_id INTEGER REFERENCES usuario(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL
);
