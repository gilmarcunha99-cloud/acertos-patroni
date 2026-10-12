import { formatBRL } from './money.mjs';

export function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) {
    if (f == null || f === false) continue;
    el.append(f.nodeType ? f : document.createTextNode(String(f)));
  }
  return el;
}

// Ícones de traço (24x24), no mesmo estilo dos do Condo·OS. Montados com
// createElementNS para não usar innerHTML.
const TRACOS = {
  inicio: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M9.5 21v-6h5v6'],
  lista: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3.5 6h.01', 'M3.5 12h.01', 'M3.5 18h.01'],
  socios: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1', 'M16 3.1a4 4 0 0 1 0 7.8', 'M22 21v-1a6 6 0 0 0-4-5.6'],
  usuario: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1'],
  calendario: ['M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M16 2v4', 'M8 2v4', 'M4 10h16'],
  mais: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  olho: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  olhoFechado: ['M3 3l18 18', 'M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2', 'M6.6 6.6A17.5 17.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
  balanca: ['M12 3v18', 'M7 21h10', 'M5 7h14', 'M5 7l-3 7a3.5 3.5 0 0 0 6 0z', 'M19 7l-3 7a3.5 3.5 0 0 0 6 0z'],
  mais_sinal: ['M12 5v14', 'M5 12h14'],
  sair: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 17l5-5-5-5', 'M15 12H4'],
  seta: ['M9 6l6 6-6 6'],
};

export function icone(nome, tam = 24) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ width: tam, height: tam, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  for (const d of TRACOS[nome] || []) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// Quadradinho com o dia e o mês de uma data 'AAAA-MM-DD' (só texto, sem Date).
export const caixaData = (iso) => h('div', { class: 'data', 'aria-hidden': 'true' },
  h('b', {}, String(Number(iso.slice(8, 10)))), h('span', {}, MESES_CURTOS[Number(iso.slice(5, 7)) - 1]));

export function campoSenha(input) {
  const botao = h('button', { type: 'button', class: 'mostrar-senha', 'aria-label': 'Mostrar senha', 'aria-pressed': 'false', onclick: () => {
    const visivel = input.type === 'password';
    input.type = visivel ? 'text' : 'password';
    botao.replaceChildren(icone(visivel ? 'olhoFechado' : 'olho', 22));
    botao.setAttribute('aria-label', visivel ? 'Ocultar senha' : 'Mostrar senha');
    botao.setAttribute('aria-pressed', String(visivel));
  } }, icone('olho', 22));
  return h('div', { class: 'campo-senha' }, input, botao);
}

export const moeda = (c) => formatBRL(c);
export const corSaldo = (c) => (c < 0 ? 'neg' : '');

export function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

export function confirmar(msg, rotulo = 'Confirmar') {
  return new Promise((resolve) => {
    const d = h('dialog', {}, h('p', {}, msg), h('div', { class: 'acoes' },
      h('button', { class: 'sec', onclick: () => { d.close(); resolve(false); } }, 'Cancelar'),
      h('button', { onclick: () => { d.close(); resolve(true); } }, rotulo)));
    d.addEventListener('close', () => { d.remove(); resolve(false); });
    document.body.append(d);
    d.showModal();
  });
}
