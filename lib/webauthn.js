// lib/webauthn.js
// Passkey (WebAuthn) verificada no servidor, só com o `crypto` do Node.
// Trazido do Condo·OS (lib/webauthn.js), onde foi testado; aqui muda só o nome do RP.
//
// Puro: nada de banco nem de HTTP. As rotas (routes/passkey.js) guardam o desafio
// e a credencial; aqui fica o que decide se a resposta do autenticador vale.
//
// O que se confere, no registro e na entrada:
//   - clientDataJSON: o tipo (webauthn.create / webauthn.get), o desafio
//     emitido por nós e a origem (a do próprio host);
//   - authenticatorData: o hash do RP ID, a presença (UP) e a verificação do
//     usuário (UV — digital, rosto ou PIN do aparelho);
//   - na entrada, a assinatura sobre authenticatorData || sha256(clientData),
//     com a chave guardada no registro, e o contador.
// A atestação não é conferida: pedimos `attestation: "none"` — o que importa é
// a chave, não o fabricante do autenticador.

const nodeCrypto = require("node:crypto");

const ALG_ES256 = -7;
const ALG_RS256 = -257;
const ALGORITMOS = [ALG_ES256, ALG_RS256];
const DESAFIO_BYTES = 32;
const DESAFIO_VALIDADE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 300000;
const RP_NOME = "Acertos Patroni";
const CREDENCIAL_ID_MAX = 1023;

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

// O motivo é para o log e para os testes; a pessoa recebe uma frase só
// (routes/passkey.js), sem dizer qual conferência falhou.
class ErroWebauthn extends Error {
  constructor(motivo) {
    super(`WebAuthn recusado: ${motivo}`);
    this.motivo = motivo;
  }
}
const recusa = (motivo) => { throw new ErroWebauthn(motivo); };

// ---------- base64url ----------

function paraBase64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

// Só o alfabeto do base64url (sem "=", "+" ou "/"): texto de outro formato é
// recusado, e não decodificado pela metade.
function deBase64url(texto) {
  // Comprimento ≡ 1 (mod 4) não é base64 de nada: o Node descartaria o resto.
  if (typeof texto !== "string" || !/^[A-Za-z0-9_-]*$/.test(texto) || texto.length % 4 === 1) recusa("BASE64URL");
  return Buffer.from(texto, "base64url");
}

// ---------- CBOR mínimo ----------
// O que o WebAuthn usa: inteiros (positivos e negativos), byte strings, texto,
// listas e mapas, de tamanho definido. Os mapas voltam como Map — as chaves
// da chave COSE são inteiros negativos.

function lerCbor(buf, inicio = 0) {
  let pos = inicio;
  const precisa = (n) => { if (pos + n > buf.length) recusa("CBOR_CURTO"); };

  function argumento(info) {
    if (info < 24) return info;
    if (info === 24) { precisa(1); return buf[pos++]; }
    if (info === 25) { precisa(2); const v = buf.readUInt16BE(pos); pos += 2; return v; }
    if (info === 26) { precisa(4); const v = buf.readUInt32BE(pos); pos += 4; return v; }
    if (info === 27) {
      precisa(8);
      const v = buf.readBigUInt64BE(pos); pos += 8;
      if (v > BigInt(Number.MAX_SAFE_INTEGER)) recusa("CBOR_GRANDE");
      return Number(v);
    }
    return recusa("CBOR_TAMANHO"); // 28–31: reservado ou tamanho indefinido
  }

  function item(profundidade) {
    if (profundidade > 16) recusa("CBOR_FUNDO");
    precisa(1);
    const inicial = buf[pos++];
    const tipo = inicial >> 5;
    const n = argumento(inicial & 0x1f);
    switch (tipo) {
      case 0: return n;
      case 1: return -1 - n;
      case 2: { precisa(n); const v = Buffer.from(buf.subarray(pos, pos + n)); pos += n; return v; }
      case 3: { precisa(n); const v = buf.toString("utf8", pos, pos + n); pos += n; return v; }
      case 4: {
        const lista = [];
        for (let i = 0; i < n; i++) lista.push(item(profundidade + 1));
        return lista;
      }
      case 5: {
        const mapa = new Map();
        const vistas = new Set();
        for (let i = 0; i < n; i++) {
          const chave = item(profundidade + 1);
          // Chave repetida: qual valor vale seria escolha do decodificador.
          const id = Buffer.isBuffer(chave) ? `b:${chave.toString("hex")}` : `${typeof chave}:${JSON.stringify(chave)}`;
          if (vistas.has(id)) recusa("CBOR_CHAVE_REPETIDA");
          vistas.add(id);
          mapa.set(chave, item(profundidade + 1));
        }
        return mapa;
      }
      default: return recusa("CBOR_TIPO");
    }
  }

  const valor = item(0);
  return { valor, fim: pos };
}

function decodificarCbor(buf) {
  const { valor, fim } = lerCbor(buf, 0);
  if (fim !== buf.length) recusa("CBOR_SOBRA");
  return valor;
}

// ---------- chave COSE ----------

// COSE (RFC 9053): 1 kty, 3 alg; EC2: -1 crv, -2 x, -3 y; RSA: -1 n, -2 e.
function jwkDoCose(cose) {
  if (!(cose instanceof Map)) recusa("COSE");
  const kty = cose.get(1);
  const alg = cose.get(3);
  if (kty === 2 && alg === ALG_ES256) {
    const x = cose.get(-2);
    const y = cose.get(-3);
    if (cose.get(-1) !== 1 || !Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) {
      recusa("COSE_EC2");
    }
    return { kty: "EC", crv: "P-256", x: paraBase64url(x), y: paraBase64url(y), alg: "ES256" };
  }
  if (kty === 3 && alg === ALG_RS256) {
    const n = cose.get(-1);
    const e = cose.get(-2);
    // Módulo de 2048 a 4096 bits; expoente ímpar e ≥ 3 (até 8 bytes).
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e) || n.length < 256 || n.length > 512) recusa("COSE_RSA");
    if (e.length === 0 || e.length > 8) recusa("COSE_RSA");
    const expoente = BigInt(`0x${e.toString("hex")}`);
    if (expoente < 3n || expoente % 2n === 0n) recusa("COSE_RSA");
    return { kty: "RSA", n: paraBase64url(n), e: paraBase64url(e), alg: "RS256" };
  }
  return recusa("COSE_ALG");
}

function chaveDaJwk(jwk) {
  try {
    const { alg, ...semAlg } = jwk;
    return nodeCrypto.createPublicKey({ key: semAlg, format: "jwk" });
  } catch {
    return recusa("CHAVE");
  }
}

function chaveDoCose(cose) {
  return chaveDaJwk(jwkDoCose(cose));
}

// ---------- authenticatorData ----------
// rpIdHash 32 | flags 1 | signCount 4 | [aaguid 16 | credIdLen 2 | credId | COSE]

function lerAuthData(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 37) recusa("AUTHDATA_CURTO");
  const dados = {
    rpIdHash: buf.subarray(0, 32),
    flags: buf[32],
    contador: buf.readUInt32BE(33),
  };
  if (dados.flags & FLAG_AT) {
    if (buf.length < 55) recusa("AUTHDATA_CURTO");
    const tam = buf.readUInt16BE(53);
    if (tam === 0 || tam > CREDENCIAL_ID_MAX || buf.length < 55 + tam) recusa("CREDENCIAL_ID");
    dados.credencialId = Buffer.from(buf.subarray(55, 55 + tam));
    const { valor, fim } = lerCbor(buf, 55 + tam);
    dados.cose = valor;
    // Depois da chave só pode vir a extensão (flag ED); sem ela, nada sobra.
    if (!(dados.flags & 0x80) && fim !== buf.length) recusa("AUTHDATA_SOBRA");
  }
  return dados;
}

// ---------- conferências comuns ----------

function lerClientData(clientDataJSON, tipo, desafio, origem) {
  let cd;
  try {
    cd = JSON.parse(Buffer.from(clientDataJSON).toString("utf8"));
  } catch {
    return recusa("CLIENTDATA");
  }
  if (!cd || typeof cd !== "object") recusa("CLIENTDATA");
  if (cd.type !== tipo) recusa("TIPO");
  if (typeof desafio !== "string" || !desafio || cd.challenge !== desafio) recusa("DESAFIO");
  if (cd.origin !== origem) recusa("ORIGEM");
  // Página de outro site embutindo a nossa num iframe: recusada.
  if (cd.crossOrigin === true) recusa("ORIGEM");
  return cd;
}

// O desafio que o clientDataJSON diz responder — para a rota achar (e gastar)
// o desafio guardado antes de conferir. Não confere nada: a conferência é
// lerClientData, depois.
function desafioDoClientData(clientDataJSONb64) {
  try {
    const cd = JSON.parse(deBase64url(clientDataJSONb64).toString("utf8"));
    return typeof cd.challenge === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(cd.challenge) ? cd.challenge : null;
  } catch {
    return null;
  }
}

function conferirAuthData(dados, rpId) {
  const esperado = nodeCrypto.createHash("sha256").update(String(rpId), "utf8").digest();
  if (!nodeCrypto.timingSafeEqual(dados.rpIdHash, esperado)) recusa("RP_ID");
  if (!(dados.flags & FLAG_UP)) recusa("SEM_UP");
  if (!(dados.flags & FLAG_UV)) recusa("SEM_UV");
}

const comoBytes = (v) => (Buffer.isBuffer(v) ? v : deBase64url(v));

// ---------- registro ----------

function verificarRegistro({ clientDataJSON, attestationObject, desafio, origem, rpId }) {
  const cdBytes = comoBytes(clientDataJSON);
  lerClientData(cdBytes, "webauthn.create", desafio, origem);
  const att = decodificarCbor(comoBytes(attestationObject));
  if (!(att instanceof Map) || !Buffer.isBuffer(att.get("authData")) || typeof att.get("fmt") !== "string") {
    recusa("ATTESTATION");
  }
  const dados = lerAuthData(att.get("authData"));
  conferirAuthData(dados, rpId);
  if (!(dados.flags & FLAG_AT) || !dados.credencialId) recusa("SEM_CREDENCIAL");
  const chavePublicaJwk = jwkDoCose(dados.cose);
  chaveDaJwk(chavePublicaJwk); // a chave tem de ser utilizável já no registro
  return {
    credencialId: paraBase64url(dados.credencialId),
    chavePublicaJwk,
    alg: dados.cose.get(3),
    contador: dados.contador,
  };
}

// ---------- entrada ----------

// Contador: autenticadores que sincronizam (iCloud, Google) mandam sempre 0.
// Com os dois diferentes de zero, o novo tem de subir — não subir é sinal de
// autenticador clonado (spec, decisão 4).
function contadorAceito(anterior, novo) {
  const a = Number(anterior) || 0;
  const n = Number(novo) || 0;
  if (a === 0 || n === 0) return true;
  return n > a;
}

function verificarEntrada({
  clientDataJSON, authenticatorData, signature, desafio, origem, rpId, chavePublicaJwk, contadorAnterior,
}) {
  const cdBytes = comoBytes(clientDataJSON);
  lerClientData(cdBytes, "webauthn.get", desafio, origem);
  const adBytes = comoBytes(authenticatorData);
  const dados = lerAuthData(adBytes);
  conferirAuthData(dados, rpId);

  const chave = chaveDaJwk(chavePublicaJwk);
  const assinado = Buffer.concat([adBytes, nodeCrypto.createHash("sha256").update(cdBytes).digest()]);
  const sig = comoBytes(signature);
  let ok = false;
  try {
    ok = chavePublicaJwk.kty === "EC"
      ? nodeCrypto.verify("sha256", assinado, { key: chave, dsaEncoding: "der" }, sig)
      : nodeCrypto.verify("sha256", assinado, { key: chave, padding: nodeCrypto.constants.RSA_PKCS1_PADDING }, sig);
  } catch {
    ok = false;
  }
  if (!ok) recusa("ASSINATURA");
  if (!contadorAceito(contadorAnterior, dados.contador)) recusa("CONTADOR");
  return { contador: dados.contador };
}

// O userHandle da entrada é o usuario_id em UTF-8 (opcoesDeRegistro). Vazio
// ou ausente passa — o autenticador pode não mandar —; presente, tem de ser o
// dono da credencial.
function userHandleConfere(userHandleB64, usuarioId) {
  if (userHandleB64 == null || userHandleB64 === "") return true;
  try {
    return deBase64url(userHandleB64).toString("utf8") === String(usuarioId);
  } catch {
    return false;
  }
}

// ---------- origem e RP ID ----------

// A lista de APP_RP_IDS (hosts separados por vírgula), normalizada.
function listaDeRpIds(texto) {
  return String(texto || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// A origem esperada e o RP ID saem do host do pedido. Nulo: o pedido não veio
// de um endereço onde a passkey possa valer.
//   - http: só `localhost`, e só fora da Vercel (desenvolvimento);
//   - https: o host, se não houver lista; com lista (APP_RP_IDS), só os dela;
//   - IP nunca é RP ID (os navegadores também recusam).
function origemDoPedido(headers, { naVercel = false, rpIdsPermitidos = [] } = {}) {
  const h = headers || {};
  const primeiro = (v) => String(v || "").split(",")[0].trim().toLowerCase();
  const host = primeiro(h["x-forwarded-host"]) || primeiro(h.host);
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return null;
  const proto = primeiro(h["x-forwarded-proto"]) || "http";
  const rpId = host.replace(/:\d+$/, "");
  if (/^[0-9.]+$/.test(rpId) || !/[a-z]/.test(rpId)) return null;
  if (rpId === "localhost") {
    return naVercel ? null : { origem: `${proto === "https" ? "https" : "http"}://${host}`, rpId };
  }
  if (proto !== "https") return null;
  if (rpIdsPermitidos.length && !rpIdsPermitidos.includes(rpId)) return null;
  return { origem: `https://${host}`, rpId };
}

// ---------- opções para o navegador ----------

function novoDesafio(crypto = nodeCrypto) {
  return paraBase64url(crypto.randomBytes(DESAFIO_BYTES));
}

function expiracaoDoDesafio(agora) {
  return new Date(new Date(agora).getTime() + DESAFIO_VALIDADE_MS).toISOString();
}

// Opções de navigator.credentials.create, com os binários em base64url (o
// cliente converte para ArrayBuffer).
function opcoesDeRegistro({ desafio, rpId, usuario, credenciaisExistentes = [] }) {
  return {
    challenge: desafio,
    rp: { id: rpId, name: RP_NOME },
    user: {
      id: paraBase64url(Buffer.from(String(usuario.usuario_id), "utf8")),
      name: usuario.email || usuario.nome || String(usuario.usuario_id),
      displayName: usuario.nome || usuario.email || "",
    },
    pubKeyCredParams: ALGORITMOS.map((alg) => ({ type: "public-key", alg })),
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
    attestation: "none",
    excludeCredentials: credenciaisExistentes.map((id) => ({ type: "public-key", id })),
    timeout: TIMEOUT_MS,
  };
}

// Opções de navigator.credentials.get: lista vazia — a credencial é
// "descobrível", e o aparelho mostra as que tem para este site.
function opcoesDeEntrada({ desafio, rpId }) {
  return { challenge: desafio, rpId, userVerification: "required", allowCredentials: [], timeout: TIMEOUT_MS };
}

module.exports = {
  ALG_ES256, ALG_RS256, ALGORITMOS, DESAFIO_VALIDADE_MS, TIMEOUT_MS, RP_NOME,
  ErroWebauthn, paraBase64url, deBase64url, decodificarCbor, jwkDoCose, chaveDoCose, lerAuthData,
  desafioDoClientData, verificarRegistro, verificarEntrada, contadorAceito, userHandleConfere,
  origemDoPedido, listaDeRpIds, novoDesafio, expiracaoDoDesafio, opcoesDeRegistro, opcoesDeEntrada,
};
