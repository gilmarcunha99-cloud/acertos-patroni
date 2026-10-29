import { h, toast, icone } from './ui.mjs';
import { api } from './api.mjs';
import { botaoInstalar } from './instalar.mjs';

const estado = { user: null, ym: null, irPara: (hash) => { location.hash = hash; } };
try { estado.ym = localStorage.getItem('ym'); } catch { /* sem storage */ }
export function guardarYm(ym) { estado.ym = ym; try { localStorage.setItem('ym', ym); } catch { /* sem storage */ } }
estado.guardarYm = guardarYm;

const TELAS = {
  painel: ['painel.mjs', 'Painel', 'inicio'],
  lancamentos: ['lancamentos.mjs', 'Lançamentos', 'lista'],
  aportes: ['aportes.mjs', 'Aportes', 'socios'],
  meses: ['meses.mjs', 'Meses', 'calendario'],
  socios: ['socios.mjs', 'Sócios', null],
  usuarios: ['usuarios.mjs', 'Usuários', null],
  lancamento: ['lancamento-form.mjs', 'Lançamento', null],
  exportar: ['exportar.mjs', 'Exportar', null],
};
const ABAS = ['painel', 'lancamentos', 'aportes', 'meses'];

function montarNav(ativa) {
  const nav = document.getElementById('nav');
  nav.hidden = !estado.user;
  const aba = (href, ativo, nomeIcone, rotulo) =>
    h('a', { href, class: ativo ? 'ativo' : '', 'aria-current': ativo ? 'page' : false }, icone(nomeIcone, 22), rotulo);
  const destino = ativa === 'lancamento' ? 'lancamentos' : ativa === 'exportar' ? 'meses' : ativa;
  nav.replaceChildren(...ABAS.map((k) => aba(`#/${k}`, k === destino, TELAS[k][2], TELAS[k][1])));
  if (estado.user) nav.append(aba('#/mais', ['mais', 'socios', 'usuarios'].includes(ativa), 'mais', 'Mais'));
}

let rotando = false;
let pendente = false;
async function rotear() {
  if (rotando) { pendente = true; return; }
  rotando = true;
  try {
    do { pendente = false; await rotearUma(); } while (pendente);
  } finally { rotando = false; }
}

async function rotearUma() {
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
    const item = (href, nomeIcone, rotulo) => h('a', { class: 'btn largo card', href }, icone(nomeIcone), h('span', { style: 'flex:1' }, rotulo), icone('seta', 20));
    return app.replaceChildren(h('div', {},
      h('div', { class: 'topo' }, h('h1', {}, 'Mais')),
      h('div', { class: 'card' }, h('div', { class: 'rotulo' }, 'Conectado como'), h('b', {}, estado.user.nome),
        h('div', { class: 'suave' }, estado.user.perfil === 'ADMIN' ? 'Administrador' : 'Sócio · somente consulta')),
      estado.user.perfil === 'ADMIN' ? item('#/socios', 'socios', 'Sócios e percentuais') : null,
      estado.user.perfil === 'ADMIN' ? item('#/usuarios', 'usuario', 'Usuários') : null,
      botaoInstalar(),
      h('button', { class: 'sec largo', style: 'margin-top:12px', onclick: async () => {
        try { await api('POST', '/api/logout'); } catch { toast('Não foi possível sair. Verifique a conexão.'); return; }
        try { await caches.delete('api'); } catch { /* sem cache */ }
        estado.user = null; location.hash = '#/'; rotear();
      } }, icone('sair', 20), 'Sair')));
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
window.addEventListener('sessao-expirada', async () => {
  if (!estado.user) return;
  try { await caches.delete('api'); } catch { /* sem cache */ }
  estado.user = null; rotear();
});
rotear();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
