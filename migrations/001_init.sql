CREATE TABLE usuario (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('ADMIN','SOCIO')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE socio (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuario(id),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE socio_percentual (
  socio_id INTEGER NOT NULL REFERENCES socio(id),
  vigente_desde TEXT NOT NULL,
  bp INTEGER NOT NULL CHECK (bp >= 0 AND bp <= 10000),
  PRIMARY KEY (socio_id, vigente_desde)
);
CREATE TABLE mes (
  ym TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO','FECHADO')),
  saldo_inicial_centavos INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE lancamento (
  id SERIAL PRIMARY KEY,
  ym TEXT NOT NULL REFERENCES mes(ym),
  tipo TEXT NOT NULL CHECK (tipo IN ('DEBITO','CREDITO')),
  descritivo TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  vencimento TEXT NOT NULL,
  forma TEXT NOT NULL CHECK (forma IN ('BOLETO','GUIA','PIX','OUTRO')),
  status TEXT NOT NULL CHECK (status IN ('A_PAGAR','PAGO','A_RECEBER','RECEBIDO')),
  ordem INTEGER NOT NULL DEFAULT 0,
  recorrencia TEXT NOT NULL DEFAULT 'NENHUMA' CHECK (recorrencia IN ('NENHUMA','FIXO','PARCELADO')),
  parcela_atual INTEGER,
  parcela_total INTEGER
);
CREATE TABLE aporte (
  ym TEXT NOT NULL REFERENCES mes(ym),
  socio_id INTEGER NOT NULL REFERENCES socio(id),
  bp INTEGER,
  base_centavos INTEGER,
  ajuste_centavos INTEGER NOT NULL DEFAULT 0,
  ajuste_motivo TEXT,
  ajuste_origem TEXT,
  final_centavos INTEGER,
  vencimento TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','PAGO')),
  PRIMARY KEY (ym, socio_id)
);
