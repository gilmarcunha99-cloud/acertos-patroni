// test/webauthn.test.js
// lib/webauthn.js com credenciais de verdade, geradas aqui: um autenticador de
// mentira monta o authenticatorData, o attestationObject (CBOR, fmt "none") e
// o clientDataJSON, e assina como um aparelho assinaria.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const W = require("../lib/webauthn");

const ORIGEM = "https://condo.exemplo.com.br";
const RP_ID = "condo.exemplo.com.br";
const DESAFIO = W.paraBase64url(crypto.randomBytes(32));

// ---------- CBOR do teste (só o que o WebAuthn usa) ----------

function cabeca(tipo, n) {
  if (n < 24) return Buffer.from([(tipo << 5) | n]);
  if (n < 256) return Buffer.from([(tipo << 5) | 24, n]);
  if (n < 65536) { const b = Buffer.alloc(3); b[0] = (tipo << 5) | 25; b.writeUInt16BE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = (tipo << 5) | 26; b.writeUInt32BE(n, 1); return b;
}
function cbor(v) {
  if (typeof v === "number") return v >= 0 ? cabeca(0, v) : cabeca(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([cabeca(2, v.length), v]);
  if (typeof v === "string") { const b = Buffer.from(v, "utf8"); return Buffer.concat([cabeca(3, b.length), b]); }
  if (Array.isArray(v)) return Buffer.concat([cabeca(4, v.length), ...v.map(cbor)]);
  if (v instanceof Map) {
    const partes = [cabeca(5, v.size)];
    for (const [k, x] of v) partes.push(cbor(k), cbor(x));
    return Buffer.concat(partes);
  }
  throw new Error("tipo sem CBOR no teste");
}

// ---------- autenticador de mentira ----------

function novoAutenticador(tipo) {
  if (tipo === "EC") {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = publicKey.export({ format: "jwk" });
    const cose = new Map([[1, 2], [3, -7], [-1, 1],
      [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]);
    return { privateKey, cose, assinar: (d) => crypto.sign("sha256", d, privateKey) };
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const cose = new Map([[1, 3], [3, -257],
    [-1, Buffer.from(jwk.n, "base64url")], [-2, Buffer.from(jwk.e, "base64url")]]);
  return {
    privateKey, cose,
    assinar: (d) => crypto.sign("sha256", d, { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }),
  };
}

const UP = 0x01, UV = 0x04, AT = 0x40;

function authData({ rpId = RP_ID, flags = UP | UV, contador = 0, credencialId, cose } = {}) {
  const partes = [crypto.createHash("sha256").update(rpId).digest(), Buffer.from([flags])];
  const c = Buffer.alloc(4); c.writeUInt32BE(contador); partes.push(c);
  if (credencialId) {
    const tam = Buffer.alloc(2); tam.writeUInt16BE(credencialId.length);
    partes.push(Buffer.alloc(16), tam, credencialId, cbor(cose));
  }
  return Buffer.concat(partes);
}

function clientData({ type, challenge = DESAFIO, origin = ORIGEM, crossOrigin }) {
  const o = { type, challenge, origin };
  if (crossOrigin !== undefined) o.crossOrigin = crossOrigin;
  return Buffer.from(JSON.stringify(o));
}

function registro(aut, { flags = UP | UV | AT, rpId, cd = {}, contador = 0 } = {}) {
  const credencialId = crypto.randomBytes(16);
  const ad = authData({ rpId, flags, contador, credencialId, cose: aut.cose });
  const att = cbor(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", ad]]));
  return {
    credencialId,
    corpo: {
      clientDataJSON: W.paraBase64url(clientData({ type: "webauthn.create", ...cd })),
      attestationObject: W.paraBase64url(att),
    },
  };
}

function entrada(aut, { flags = UP | UV, rpId, contador = 0, cd = {}, estragar = false } = {}) {
  const ad = authData({ rpId, flags, contador });
  const cdb = clientData({ type: "webauthn.get", ...cd });
  let sig = aut.assinar(Buffer.concat([ad, crypto.createHash("sha256").update(cdb).digest()]));
  if (estragar) { sig = Buffer.from(sig); sig[sig.length - 1] ^= 0xff; }
  return {
    clientDataJSON: W.paraBase64url(cdb),
    authenticatorData: W.paraBase64url(ad),
    signature: W.paraBase64url(sig),
  };
}

const esperado = { desafio: DESAFIO, origem: ORIGEM, rpId: RP_ID };
const recusa = (motivo) => (e) => e instanceof W.ErroWebauthn && e.motivo === motivo;

function registrado(tipo) {
  const aut = novoAutenticador(tipo);
  const r = W.verificarRegistro({ ...registro(aut).corpo, ...esperado });
  return { aut, r };
}

// ---------- base64url e CBOR ----------

test("base64url vai e volta, e recusa outro alfabeto", () => {
  const b = Buffer.from([0xfb, 0xff, 0x00, 0x10]);
  assert.equal(W.paraBase64url(b), "-_8AEA");
  assert.deepEqual(W.deBase64url("-_8AEA"), b);
  assert.throws(() => W.deBase64url("+/8AEA=="), recusa("BASE64URL"));
  assert.throws(() => W.deBase64url(42), recusa("BASE64URL"));
});

test("CBOR: inteiros, negativos, bytes, texto, listas e mapas", () => {
  const m = W.decodificarCbor(cbor(new Map([[1, 2], [-257, "x"], ["l", [0, 23, 24, 300, 70000, -1]],
    ["b", Buffer.from([1, 2])]])));
  assert.equal(m.get(1), 2);
  assert.equal(m.get(-257), "x");
  assert.deepEqual(m.get("l"), [0, 23, 24, 300, 70000, -1]);
  assert.deepEqual(m.get("b"), Buffer.from([1, 2]));
});

test("CBOR: curto, sobra, tamanho indefinido e tipo fora do uso são recusados", () => {
  assert.throws(() => W.decodificarCbor(Buffer.from([0x42, 0x01])), recusa("CBOR_CURTO"));
  assert.throws(() => W.decodificarCbor(Buffer.from([0x01, 0x02])), recusa("CBOR_SOBRA"));
  assert.throws(() => W.decodificarCbor(Buffer.from([0x5f])), recusa("CBOR_TAMANHO"));
  assert.throws(() => W.decodificarCbor(Buffer.from([0xf5])), recusa("CBOR_TIPO"));
});

test("chave COSE: EC2 P-256 (-7) e RSA (-257) viram chave pública; outra não", () => {
  assert.equal(W.chaveDoCose(novoAutenticador("EC").cose).asymmetricKeyType, "ec");
  assert.equal(W.chaveDoCose(novoAutenticador("RSA").cose).asymmetricKeyType, "rsa");
  assert.throws(() => W.chaveDoCose(new Map([[1, 1], [3, -8]])), recusa("COSE_ALG"));
  const ec = novoAutenticador("EC").cose;
  ec.set(-1, 2); // P-384 com alg -7
  assert.throws(() => W.chaveDoCose(ec), recusa("COSE_EC2"));
});

test("base64url: comprimento ≡ 1 (mod 4) é recusado", () => {
  assert.throws(() => W.deBase64url("abcde"), recusa("BASE64URL"));
  assert.equal(W.deBase64url("abcdef").length, 4);
});

test("CBOR: chave repetida, fundo demais e tamanho de 8 bytes acima do seguro", () => {
  // {1: 1, 1: 2}
  assert.throws(() => W.decodificarCbor(Buffer.from([0xa2, 0x01, 0x01, 0x01, 0x02])), recusa("CBOR_CHAVE_REPETIDA"));
  // {"a": 1, "a": 2}
  assert.throws(() => W.decodificarCbor(Buffer.from([0xa2, 0x61, 0x61, 0x01, 0x61, 0x61, 0x02])),
    recusa("CBOR_CHAVE_REPETIDA"));
  // 1 e "1" são chaves diferentes
  assert.equal(W.decodificarCbor(Buffer.from([0xa2, 0x01, 0x01, 0x61, 0x31, 0x02])).size, 2);
  // 20 listas uma dentro da outra
  assert.throws(() => W.decodificarCbor(Buffer.concat([Buffer.alloc(20, 0x81), Buffer.from([0x00])])),
    recusa("CBOR_FUNDO"));
  // inteiro de 8 bytes = 2^64-1
  assert.throws(() => W.decodificarCbor(Buffer.from([0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])),
    recusa("CBOR_GRANDE"));
  // byte string que diz ter 2^32-1 bytes
  assert.throws(() => W.decodificarCbor(Buffer.from([0x5a, 0xff, 0xff, 0xff, 0xff])), recusa("CBOR_CURTO"));
});

test("chave RSA: módulo entre 256 e 512 bytes; expoente ímpar e ≥ 3", () => {
  const { cose } = novoAutenticador("RSA");
  const com = (k, v) => { const m = new Map(cose); m.set(k, v); return m; };
  assert.throws(() => W.chaveDoCose(com(-1, crypto.randomBytes(255))), recusa("COSE_RSA"));
  assert.throws(() => W.chaveDoCose(com(-1, crypto.randomBytes(513))), recusa("COSE_RSA"));
  assert.throws(() => W.chaveDoCose(com(-2, Buffer.from([0x01, 0x00, 0x00]))), recusa("COSE_RSA")); // par
  assert.throws(() => W.chaveDoCose(com(-2, Buffer.from([0x01]))), recusa("COSE_RSA")); // 1
  assert.throws(() => W.chaveDoCose(com(-2, Buffer.alloc(0))), recusa("COSE_RSA"));
  assert.throws(() => W.chaveDoCose(com(-2, Buffer.alloc(9, 1))), recusa("COSE_RSA"));
  assert.equal(W.chaveDoCose(com(-2, Buffer.from([0x03]))).asymmetricKeyType, "rsa");
});

test("authenticatorData: curto, id da credencial além do fim, COSE cortada, sobra", () => {
  assert.throws(() => W.lerAuthData(Buffer.alloc(36)), recusa("AUTHDATA_CURTO"));
  assert.throws(() => W.lerAuthData("texto"), recusa("AUTHDATA_CURTO"));
  const { cose } = novoAutenticador("EC");
  const ad = authData({ flags: UP | UV | AT, credencialId: crypto.randomBytes(16), cose });
  assert.ok(W.lerAuthData(ad).cose instanceof Map);
  // AT ligada, mas sem os 18 bytes de aaguid + tamanho
  assert.throws(() => W.lerAuthData(ad.subarray(0, 50)), recusa("AUTHDATA_CURTO"));
  // tamanho do id maior que o que resta
  const longe = Buffer.from(ad); longe.writeUInt16BE(1000, 53);
  assert.throws(() => W.lerAuthData(longe), recusa("CREDENCIAL_ID"));
  const zero = Buffer.from(ad); zero.writeUInt16BE(0, 53);
  assert.throws(() => W.lerAuthData(zero), recusa("CREDENCIAL_ID"));
  assert.throws(() => W.lerAuthData(ad.subarray(0, ad.length - 5)), recusa("CBOR_CURTO"));
  assert.throws(() => W.lerAuthData(Buffer.concat([ad, Buffer.from([0x00])])), recusa("AUTHDATA_SOBRA"));
});

// ---------- registro ----------

for (const tipo of ["EC", "RSA"]) {
  test(`registro ${tipo}: devolve o id da credencial, a chave e o contador`, () => {
    const aut = novoAutenticador(tipo);
    const { credencialId, corpo } = registro(aut, { contador: 3 });
    const r = W.verificarRegistro({ ...corpo, ...esperado });
    assert.equal(r.credencialId, W.paraBase64url(credencialId));
    assert.equal(r.chavePublicaJwk.kty, tipo);
    assert.equal(r.alg, tipo === "EC" ? -7 : -257);
    assert.equal(r.contador, 3);
  });

  test(`entrada ${tipo}: assinatura certa passa e devolve o contador`, () => {
    const { aut, r } = registrado(tipo);
    const out = W.verificarEntrada({
      ...entrada(aut, { contador: 7 }), ...esperado, chavePublicaJwk: r.chavePublicaJwk, contadorAnterior: 6,
    });
    assert.deepEqual(out, { contador: 7 });
  });

  test(`entrada ${tipo}: assinatura errada é recusada`, () => {
    const { aut, r } = registrado(tipo);
    assert.throws(() => W.verificarEntrada({
      ...entrada(aut, { estragar: true }), ...esperado, chavePublicaJwk: r.chavePublicaJwk, contadorAnterior: 0,
    }), recusa("ASSINATURA"));
  });
}

test("entrada: a chave de outra credencial não vale", () => {
  const { r } = registrado("EC");
  const outro = novoAutenticador("EC");
  assert.throws(() => W.verificarEntrada({
    ...entrada(outro), ...esperado, chavePublicaJwk: r.chavePublicaJwk, contadorAnterior: 0,
  }), recusa("ASSINATURA"));
});

test("registro: desafio, origem, RP ID, tipo e flags", () => {
  const aut = novoAutenticador("EC");
  const casos = [
    [registro(aut, { cd: { challenge: W.paraBase64url(crypto.randomBytes(32)) } }), "DESAFIO"],
    [registro(aut, { cd: { origin: "https://outro.com.br" } }), "ORIGEM"],
    [registro(aut, { cd: { crossOrigin: true } }), "ORIGEM"],
    [registro(aut, { cd: { type: "webauthn.get" } }), "TIPO"],
    [registro(aut, { rpId: "outro.com.br" }), "RP_ID"],
    [registro(aut, { flags: UP | AT }), "SEM_UV"],
    [registro(aut, { flags: UV | AT }), "SEM_UP"],
  ];
  for (const [{ corpo }, motivo] of casos) {
    assert.throws(() => W.verificarRegistro({ ...corpo, ...esperado }), recusa(motivo), motivo);
  }
});

test("registro: sem a credencial no authenticatorData é recusado", () => {
  const ad = authData({ flags: UP | UV });
  const att = cbor(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", ad]]));
  assert.throws(() => W.verificarRegistro({
    clientDataJSON: W.paraBase64url(clientData({ type: "webauthn.create" })),
    attestationObject: W.paraBase64url(att), ...esperado,
  }), recusa("SEM_CREDENCIAL"));
});

test("entrada: desafio, origem, RP ID, tipo e sem UV", () => {
  const { aut, r } = registrado("EC");
  const base = { ...esperado, chavePublicaJwk: r.chavePublicaJwk, contadorAnterior: 0 };
  const casos = [
    [entrada(aut, { cd: { challenge: W.paraBase64url(crypto.randomBytes(32)) } }), "DESAFIO"],
    [entrada(aut, { cd: { origin: "https://condo.exemplo.com.br:8443" } }), "ORIGEM"],
    [entrada(aut, { cd: { type: "webauthn.create" } }), "TIPO"],
    [entrada(aut, { rpId: "exemplo.com.br" }), "RP_ID"],
    [entrada(aut, { flags: UP }), "SEM_UV"],
  ];
  for (const [corpo, motivo] of casos) {
    assert.throws(() => W.verificarEntrada({ ...corpo, ...base }), recusa(motivo), motivo);
  }
  // A resposta certa contra um desafio guardado diferente (outro pedido).
  assert.throws(() => W.verificarEntrada({
    ...entrada(aut), ...base, desafio: W.paraBase64url(crypto.randomBytes(32)),
  }), recusa("DESAFIO"));
});

test("entrada: contador que não sobe é recusado; zero de qualquer lado passa", () => {
  const { aut, r } = registrado("EC");
  const com = (anterior, novo) => () => W.verificarEntrada({
    ...entrada(aut, { contador: novo }), ...esperado, chavePublicaJwk: r.chavePublicaJwk, contadorAnterior: anterior,
  });
  assert.throws(com(5, 5), recusa("CONTADOR"));
  assert.throws(com(5, 4), recusa("CONTADOR"));
  assert.deepEqual(com(5, 6)(), { contador: 6 });
  assert.deepEqual(com(0, 0)(), { contador: 0 });
  assert.deepEqual(com(0, 9)(), { contador: 9 });
  assert.deepEqual(com(5, 0)(), { contador: 0 });
});

// ---------- o que as rotas usam ----------

test("desafioDoClientData lê o desafio sem conferir; lixo vira nulo", () => {
  assert.equal(W.desafioDoClientData(W.paraBase64url(clientData({ type: "webauthn.get" }))), DESAFIO);
  assert.equal(W.desafioDoClientData("não é base64url"), null);
  assert.equal(W.desafioDoClientData(W.paraBase64url(Buffer.from("{}"))), null);
  assert.equal(W.desafioDoClientData(undefined), null);
});

test("userHandle: ausente passa; presente tem de ser o usuario_id", () => {
  const id = "0b0c5d3e-1111-4222-8333-944445555666";
  assert.equal(W.userHandleConfere(undefined, id), true);
  assert.equal(W.userHandleConfere("", id), true);
  assert.equal(W.userHandleConfere(W.paraBase64url(Buffer.from(id)), id), true);
  assert.equal(W.userHandleConfere(W.paraBase64url(Buffer.from("outro")), id), false);
  assert.equal(W.userHandleConfere("+++", id), false);
});

test("origem e RP ID saem do host; http só em localhost fora da Vercel", () => {
  assert.deepEqual(W.origemDoPedido({ "x-forwarded-host": "condo.exemplo.com.br", "x-forwarded-proto": "https", host: "x" }),
    { origem: "https://condo.exemplo.com.br", rpId: "condo.exemplo.com.br" });
  assert.deepEqual(W.origemDoPedido({ host: "localhost:3000" }), { origem: "http://localhost:3000", rpId: "localhost" });
  assert.equal(W.origemDoPedido({ host: "127.0.0.1:3000" }), null);
  assert.equal(W.origemDoPedido({ host: "10.0.0.5", "x-forwarded-proto": "https" }), null);
  assert.equal(W.origemDoPedido({ host: "localhost:3000" }, { naVercel: true }), null);
  assert.equal(W.origemDoPedido({ host: "condo.exemplo.com.br" }), null);
  assert.equal(W.origemDoPedido({ host: "condo.exemplo.com.br", "x-forwarded-proto": "ftp" }), null);
  assert.equal(W.origemDoPedido({ host: "a b" }), null);
  assert.equal(W.origemDoPedido({}), null);
  assert.deepEqual(W.origemDoPedido({ "x-forwarded-host": "A.com, b.com", "x-forwarded-proto": "https,http" }),
    { origem: "https://a.com", rpId: "a.com" });
});

test("APP_RP_IDS: com lista, só os hosts dela; localhost de desenvolvimento continua", () => {
  const lista = W.listaDeRpIds(" Condo.Exemplo.com.br , app.exemplo.com ,");
  assert.deepEqual(lista, ["condo.exemplo.com.br", "app.exemplo.com"]);
  const https = (host) => ({ host, "x-forwarded-proto": "https" });
  assert.deepEqual(W.origemDoPedido(https("app.exemplo.com"), { rpIdsPermitidos: lista }),
    { origem: "https://app.exemplo.com", rpId: "app.exemplo.com" });
  assert.equal(W.origemDoPedido(https("x.vercel.app"), { rpIdsPermitidos: lista }), null);
  assert.deepEqual(W.origemDoPedido(https("x.vercel.app"), { rpIdsPermitidos: [] }),
    { origem: "https://x.vercel.app", rpId: "x.vercel.app" });
  assert.deepEqual(W.origemDoPedido({ host: "localhost:3000" }, { rpIdsPermitidos: lista }),
    { origem: "http://localhost:3000", rpId: "localhost" });
  assert.deepEqual(W.listaDeRpIds(undefined), []);
});

test("opções de registro: as do spec, com o usuario_id como userHandle", () => {
  const o = W.opcoesDeRegistro({
    desafio: "abc", rpId: RP_ID,
    usuario: { usuario_id: "u-1", email: "a@b.c", nome: "Ana" },
    credenciaisExistentes: ["c1"],
  });
  assert.equal(o.challenge, "abc");
  assert.deepEqual(o.rp, { id: RP_ID, name: "Acertos Patroni" });
  assert.deepEqual(o.user, { id: W.paraBase64url(Buffer.from("u-1")), name: "a@b.c", displayName: "Ana" });
  assert.deepEqual(o.pubKeyCredParams.map((p) => p.alg), [-7, -257]);
  assert.equal(o.authenticatorSelection.residentKey, "required");
  assert.equal(o.authenticatorSelection.userVerification, "required");
  assert.equal(o.attestation, "none");
  assert.deepEqual(o.excludeCredentials, [{ type: "public-key", id: "c1" }]);
  assert.equal(o.timeout, 300000);
});

test("opções de entrada: descobrível, com UV obrigatório", () => {
  assert.deepEqual(W.opcoesDeEntrada({ desafio: "abc", rpId: RP_ID }),
    { challenge: "abc", rpId: RP_ID, userVerification: "required", allowCredentials: [], timeout: 300000 });
});

test("desafio: 32 bytes aleatórios, válido por 5 minutos", () => {
  const d = W.novoDesafio();
  assert.equal(W.deBase64url(d).length, 32);
  assert.notEqual(W.novoDesafio(), d);
  assert.equal(W.novoDesafio({ randomBytes: (n) => Buffer.alloc(n, 1) }), W.paraBase64url(Buffer.alloc(32, 1)));
  assert.equal(W.expiracaoDoDesafio("2026-10-04T12:00:00.000Z"), "2026-10-04T12:05:00.000Z");
});
