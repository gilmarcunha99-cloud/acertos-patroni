import { h } from '../ui.mjs';
import { nomeDoMes } from '../cobranca.mjs';

export function escolherYm(estado, meses) {
  if (estado.ym && meses.some((m) => m.ym === estado.ym)) return estado.ym;
  return meses.length ? meses[0].ym : null;
}

export function seletorMes(estado, meses, atual) {
  return h('select', { 'aria-label': 'Mês', onchange: (ev) => {
    estado.guardarYm(ev.target.value);
    window.dispatchEvent(new Event('hashchange'));
  } }, meses.map((m) => h('option', { value: m.ym, selected: m.ym === atual }, nomeDoMes(m.ym))));
}

export const rotuloLancamento = (l) =>
  l.recorrencia === 'PARCELADO' ? `${l.descritivo} ${l.parcela_atual}/${l.parcela_total}` : l.descritivo;
