import { h } from './ui.mjs';
import { api } from './api.mjs';

const estado = { user: null, ym: null, irPara: (hash) => { location.hash = hash; } };
try { estado.ym = localStorage.getItem('ym'); } catch { /* sem storage */ }
export function guardarYm(ym) { estado.ym = ym; try { localStorage.setItem('ym', ym); } catch { /* sem storage */ } }
estado.guardarYm = guardarYm;

const TELAS = {
  painel: ['painel.mjs', 'Painel', 'ti-home'],
  lancamentos: ['lancamentos.mjs', 'Lançamentos', 'ti-list'],
  aportes: ['aportes.mjs', 'Aportes', 'ti-users'],
  meses: ['meses.mjs', 'Meses', 'ti-calendar'],
  socios: ['socios.mjs', 'Sócios', null],
  usuarios: ['usuarios.mjs', 'Usuários', null],
  lancamento: ['lancamento-form.mjs', 'Lançamento', null],
  exportar: ['exportar.mjs', 'Exportar', null],
};
const ABAS = ['painel', 'lancamentos', 'aportes', 'meses'];

function montarNav(ativa) {
  const nav = document.getElementById('nav');
  nav.hidden = !estado.user;
  nav.replaceChildren(...ABAS.map((k) => h('a', { href: `#/${k}`, class: k === ativa ? 'ativo' : '' }, TELAS[k][1])));
  if (estado.user && estado.user.perfil === 'ADMIN') {
    nav.append(h('a', { href: '#/mais', class: ['mais', 'socios', 'usuarios'].includes(ativa) ? 'ativo' : '' }, 'Mais'));
  }
}

async function rotear() {
  const app = document.getElementById('app');
  if (!estado.user) {
    try { estado.user = await api('GET', '/api/me'); } catch { estado.user = null; }
  }
  const [, nome = 'painel', arg] = location.hash.split('/');
  if (!estado.user) {
    montarNav(null);
    return app.replaceChildren(await (await import('./telas/login.mjs')).render(estado));
  }
  if (nome === 'mais') {
    montarNav('mais');
    return app.replaceChildren(h('div', {},
      h('div', { class: 'topo' }, h('h1', {}, 'Mais')),
      h('a', { class: 'btn largo card', href: '#/socios' }, 'Sócios e percentuais'),
      h('a', { class: 'btn largo card', href: '#/usuarios' }, 'Usuários'),
      h('button', { class: 'sec largo', onclick: async () => {
        await api('POST', '/api/logout');
        try { await caches.delete('api'); } catch { /* sem cache */ }
        estado.user = null; location.hash = '#/'; rotear();
      } }, 'Sair')));
  }
  const def = TELAS[nome] || TELAS.painel;
  montarNav(nome);
  estado.arg = arg;
  try {
    app.replaceChildren(await (await import(`./telas/${def[0]}`)).render(estado));
  } catch (e) {
    app.replaceChildren(h('div', { class: 'card' }, e.message));
  }
}

window.addEventListener('hashchange', rotear);
window.addEventListener('sessao-expirada', () => { estado.user = null; rotear(); });
rotear();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
