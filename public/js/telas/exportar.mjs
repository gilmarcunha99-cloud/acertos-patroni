import { h, moeda } from '../ui.mjs';
import { api } from '../api.mjs';
import { nomeDoMes } from '../cobranca.mjs';
import { escolherYm, rotuloLancamento } from './seletor-mes.mjs';

const data = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export async function render(estado) {
  const meses = await api('GET', '/api/meses');
  const ym = escolherYm(estado, meses);
  if (!ym) return h('div', { class: 'card' }, 'Nenhum mês aberto ainda.');
  const v = await api('GET', `/api/meses/${ym}`);
  const td = (t, cls) => h('td', { class: cls || '', style: 'border:1px solid #999;padding:4px 6px' }, t);
  const linha = (desc, venc, cred, deb, saldo, pg) => h('tr', {}, td(desc), td(venc), td(cred, ''), td(deb, ''), td(saldo, saldo.startsWith('-') ? 'neg' : ''), td(pg));
  const corpo = [
    linha('SALDO BANCO', data(`${ym}-01`), '', v.saldo_inicial_centavos < 0 ? moeda(-v.saldo_inicial_centavos) : '', moeda(v.saldo_inicial_centavos), ''),
    ...v.lancamentos.map((l) => linha(rotuloLancamento(l), data(l.vencimento), l.tipo === 'CREDITO' ? moeda(l.valor_centavos) : '', l.tipo === 'DEBITO' ? moeda(l.valor_centavos) : '', moeda(l.saldo_centavos), l.forma)),
    ...v.aportes.map((a) => linha(`Aporte ${a.nome} (${a.bp / 100}%)`, data(a.vencimento), moeda(a.final_centavos), '', moeda(a.saldo_centavos), 'PIX')),
  ];
  return h('div', {},
    h('div', { class: 'topo nao-imprime' }, h('h1', {}, 'Exportar'), h('a', { href: '#/meses' }, 'Voltar')),
    h('h2', { style: 'text-align:center' }, `ACERTOS PATRONI - ${nomeDoMes(ym).toUpperCase()}`),
    h('table', { style: 'border-collapse:collapse;width:100%;font-size:13px' },
      h('thead', {}, h('tr', {}, ['Descritivo', 'Vencimento', 'Crédito (R$)', 'Débito (R$)', 'SALDO (R$)', 'PGTO'].map((t) => h('th', { style: 'border:1px solid #999;padding:4px 6px;background:#dbe5f1' }, t)))),
      h('tbody', {}, corpo)),
    v.provisorio ? h('p', { class: 'suave' }, 'Mês aberto: aportes provisórios.') : null,
    h('button', { class: 'largo nao-imprime', style: 'margin-top:12px', onclick: () => window.print() }, 'Exportar PDF'));
}
