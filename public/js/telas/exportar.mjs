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
  const td = (t, cls) => h('td', { class: cls || '' }, t);
  const linha = (desc, venc, cred, deb, saldo, pg) => h('tr', {},
    td(desc), td(venc), td(cred, 'num'), td(deb, 'num'), td(saldo, `num ${saldo.startsWith('-') ? 'neg' : ''}`), td(pg));
  const corpo = [
    linha('SALDO BANCO', data(`${ym}-01`), '', v.saldo_inicial_centavos < 0 ? moeda(-v.saldo_inicial_centavos) : '', moeda(v.saldo_inicial_centavos), ''),
    ...v.lancamentos.map((l) => linha(rotuloLancamento(l), data(l.vencimento), l.tipo === 'CREDITO' ? moeda(l.valor_centavos) : '', l.tipo === 'DEBITO' ? moeda(l.valor_centavos) : '', moeda(l.saldo_centavos), l.forma)),
    ...v.aportes.map((a) => linha(`Aporte ${a.nome} (${String(a.bp / 100).replace('.', ',')}%)`, data(a.vencimento), moeda(a.final_centavos), '', moeda(a.saldo_centavos), 'PIX')),
  ];
  return h('div', {},
    h('div', { class: 'topo nao-imprime' }, h('h1', {}, 'Exportar'), h('a', { href: '#/meses' }, 'Voltar')),
    h('div', { class: 'card folha-planilha' },
      h('h2', { class: 'titulo-planilha' }, `ACERTOS PATRONI - ${nomeDoMes(ym).toUpperCase()}`),
      h('div', { class: 'rolagem-planilha' },
        h('table', { class: 'planilha' },
          h('thead', {}, h('tr', {}, ['Descritivo', 'Vencimento', 'Crédito (R$)', 'Débito (R$)', 'SALDO (R$)', 'PGTO'].map((t) => h('th', {}, t)))),
          h('tbody', {}, corpo))),
      v.provisorio ? h('p', { class: 'suave' }, 'Mês aberto: aportes provisórios.') : null),
    h('button', { class: 'largo nao-imprime', onclick: () => window.print() }, 'Exportar PDF'));
}
