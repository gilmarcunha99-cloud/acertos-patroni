export async function api(method, path, body) {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* sem corpo */ }
  if (r.status === 401 && !['/api/login', '/api/me', '/api/logout'].includes(path)) window.dispatchEvent(new Event('sessao-expirada'));
  if (!r.ok) {
    const e = new Error((json && json.erro) || 'Não foi possível concluir. Tente de novo.');
    e.dados = json; e.status = r.status;
    throw e;
  }
  return json;
}
