import { api } from './api.mjs';

// Entrada por digital (passkey). O servidor manda as opções com os binários em
// base64url; o navegador quer ArrayBuffer, e devolve ArrayBuffer.
const paraBuffer = (b64) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0)).buffer;
};
const paraB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// O id da credencial deste aparelho, para "Remover digital deste aparelho" e
// para a trava ao abrir. Só uma marca local: a credencial vive no servidor.
const CHAVE = 'digital-credencial';
export const credencialDoAparelho = () => { try { return localStorage.getItem(CHAVE); } catch { return null; } };
const marcar = (id) => { try { if (id) localStorage.setItem(CHAVE, id); else localStorage.removeItem(CHAVE); } catch { /* sem storage */ } };

// "Sair" não deve pedir a digital logo em seguida (a pessoa quis sair).
const SEM_TRAVA = 'digital-sem-trava';
export const pularTrava = () => { try { sessionStorage.setItem(SEM_TRAVA, '1'); } catch { /* sem storage */ } };
export function travaAtiva() {
  try { if (sessionStorage.getItem(SEM_TRAVA)) return false; } catch { /* sem storage */ }
  return Boolean(credencialDoAparelho());
}

export async function digitalDisponivel() {
  try {
    return Boolean(window.PublicKeyCredential && isSecureContext
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

const nomeDoAparelho = () => {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  const m = /Android[^;]*;\s*([^;)]+?)(?:\sBuild|\))/.exec(ua);
  if (m) return m[1].trim().slice(0, 40);
  return /Android/.test(ua) ? 'Android' : 'Este aparelho';
};

export async function ativarDigital() {
  const o = await api('POST', '/api/passkey/registro/opcoes', {});
  const cred = await navigator.credentials.create({ publicKey: {
    ...o,
    challenge: paraBuffer(o.challenge),
    user: { ...o.user, id: paraBuffer(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: paraBuffer(c.id) })),
  } });
  const r = await api('POST', '/api/passkey/registro', {
    clientDataJSON: paraB64(cred.response.clientDataJSON),
    attestationObject: paraB64(cred.response.attestationObject),
    aparelho: nomeDoAparelho(),
  });
  marcar(r.credencial_id);
  return r;
}

export async function entrarComDigital() {
  const o = await api('POST', '/api/passkey/entrada/opcoes', {});
  const cred = await navigator.credentials.get({ publicKey: { ...o, challenge: paraBuffer(o.challenge) } });
  const usuario = await api('POST', '/api/passkey/entrada', {
    id: paraB64(cred.rawId),
    clientDataJSON: paraB64(cred.response.clientDataJSON),
    authenticatorData: paraB64(cred.response.authenticatorData),
    signature: paraB64(cred.response.signature),
    userHandle: cred.response.userHandle ? paraB64(cred.response.userHandle) : '',
  });
  marcar(paraB64(cred.rawId));
  return usuario;
}

export async function removerDigitalDoAparelho() {
  const id = credencialDoAparelho();
  const lista = await api('GET', '/api/passkey');
  const minha = lista.find((p) => p.credencial_id === id);
  if (minha) await api('DELETE', `/api/passkey/${minha.id}`);
  marcar(null);
}

// Cancelar no celular vira NotAllowedError: não é erro para mostrar.
export const foiCancelado = (e) => e && (e.name === 'NotAllowedError' || e.name === 'AbortError');
