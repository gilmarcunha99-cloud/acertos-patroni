import { h, moeda, toast, confirmar } from '../ui.mjs';
import { api } from '../api.mjs';
import { parseBRL } from '../money.mjs';
import { nomeDoMes } from '../cobranca.mjs';

function proximoYm(ym) {
  const [a, m] = ym.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

export async function render(estado) {
  const meses = await api('GET', '/api/meses');
  const admin = estado.user.perfil === 'ADMIN';
  const recarregar = () => window.dispatchEvent(new Event('hashchange'));

  const abrir = async () => {
    const primeiro = meses.length === 0;
    const alvo = primeiro ? new Date().toISOString().slice(0, 7) : proximoYm(meses[0].ym);
    let corpo = { ym: alvo };
    if (primeiro) {
      const txt = prompt(`Saldo do banco em 01/${alvo.slice(5)}/${alvo.slice(0, 4)} (R$, negativo se devedor):`, '0,00');
      const c = txt === null ? null : parseBRL(txt);
      if (c === null) return;
      corpo.saldo_inicial_centavos = c;
    } else if (!(await confirmar(`Abrir ${nomeDoMes(alvo)}? Os lançamentos fixos e parcelados serão copiados.`, 'Abrir mês'))) return;
    try { await api('POST', '/api/meses/abrir', corpo); estado.guardarYm(alvo); recarregar(); }
    catch (e) { toast(e.message); }
  };
  const reabrir = async (ym) => {
    if (!(await confirmar(`Reabrir ${nomeDoMes(ym)}? Os aportes voltam a ser provisórios.`, 'Reabrir'))) return;
    try { await api('POST', `/api/meses/${ym}/reabrir`, {}); recarregar(); } catch (e) { toast(e.message); }
  };

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Meses'), admin ? h('button', { onclick: abrir }, meses.length ? `Abrir ${nomeDoMes(proximoYm(meses[0].ym))}` : 'Abrir mês') : null),
    h('div', { class: 'card' }, meses.length ? meses.map((m, i) => h('div', { class: 'linha' },
      h('span', {}, h('a', { href: '#/painel', onclick: () => estado.guardarYm(m.ym) }, nomeDoMes(m.ym)), h('br'), h('span', { class: 'suave' }, `débitos ${moeda(m.debitos)}`)),
      h('span', {}, h('span', { class: `tag ${m.status === 'FECHADO' ? 'ok' : 'aviso'}` }, m.status === 'FECHADO' ? 'fechado' : 'aberto'), ' ',
        h('a', { href: '#/exportar', onclick: () => estado.guardarYm(m.ym) }, 'exportar'),
        admin && i === 0 && m.status === 'FECHADO' ? [' ', h('a', { href: '#/meses', onclick: (ev) => { ev.preventDefault(); reabrir(m.ym); } }, 'reabrir')] : null)))
      : h('p', { class: 'suave' }, 'Nenhum mês ainda.')),
    h('p', { class: 'suave' }, 'Ao abrir um mês, o app copia os lançamentos fixos e parcelados (avançando a parcela) e leva o saldo final como saldo inicial.'));
}
