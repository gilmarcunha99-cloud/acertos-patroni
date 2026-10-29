// Autenticador de mentira para os testes de rota: monta o que o celular
// mandaria no registro e na entrada, e assina com uma chave P-256 gerada aqui.
const crypto = require('crypto');
const W = require('../../lib/webauthn');

function cabeca(tipo, n) {
  if (n < 24) return Buffer.from([(tipo << 5) | n]);
  if (n < 256) return Buffer.from([(tipo << 5) | 24, n]);
  const b = Buffer.alloc(3); b[0] = (tipo << 5) | 25; b.writeUInt16BE(n, 1); return b;
}
function cbor(v) {
  if (typeof v === 'number') return v >= 0 ? cabeca(0, v) : cabeca(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([cabeca(2, v.length), v]);
  if (typeof v === 'string') { const b = Buffer.from(v, 'utf8'); return Buffer.concat([cabeca(3, b.length), b]); }
  if (v instanceof Map) {
    const partes = [cabeca(5, v.size)];
    for (const [k, x] of v) partes.push(cbor(k), cbor(x));
    return Buffer.concat(partes);
  }
  throw new Error('tipo sem CBOR no teste');
}

function novoAutenticador() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
  return { cose, credencialId: crypto.randomBytes(16), assinar: (d) => crypto.sign('sha256', d, privateKey) };
}

function authData({ rpId, contador = 0, credencialId, cose }) {
  const flags = 0x01 | 0x04 | (credencialId ? 0x40 : 0);
  const partes = [crypto.createHash('sha256').update(rpId).digest(), Buffer.from([flags])];
  const c = Buffer.alloc(4); c.writeUInt32BE(contador); partes.push(c);
  if (credencialId) {
    const tam = Buffer.alloc(2); tam.writeUInt16BE(credencialId.length);
    partes.push(Buffer.alloc(16), tam, credencialId, cbor(cose));
  }
  return Buffer.concat(partes);
}

const clientData = (type, desafio, origem) => Buffer.from(JSON.stringify({ type, challenge: desafio, origin: origem }));

function registro(aut, { desafio, origem, rpId }) {
  const ad = authData({ rpId, credencialId: aut.credencialId, cose: aut.cose });
  return {
    clientDataJSON: W.paraBase64url(clientData('webauthn.create', desafio, origem)),
    attestationObject: W.paraBase64url(cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', ad]]))),
  };
}

function entrada(aut, { desafio, origem, rpId, contador = 0, userHandle }) {
  const ad = authData({ rpId, contador });
  const cd = clientData('webauthn.get', desafio, origem);
  const sig = aut.assinar(Buffer.concat([ad, crypto.createHash('sha256').update(cd).digest()]));
  return {
    id: W.paraBase64url(aut.credencialId),
    clientDataJSON: W.paraBase64url(cd),
    authenticatorData: W.paraBase64url(ad),
    signature: W.paraBase64url(sig),
    userHandle: userHandle === undefined ? '' : userHandle,
  };
}

module.exports = { novoAutenticador, registro, entrada };
