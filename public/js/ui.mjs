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

export const moeda = (c) => formatBRL(c);
export const corSaldo = (c) => (c < 0 ? 'neg' : '');

export function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
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
