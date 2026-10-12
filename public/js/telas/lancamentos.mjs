import { h, moeda } from '../ui.mjs';
import { api } from '../api.mjs';
import { escolherYm, seletorMes, rotuloLancamento } from './seletor-mes.mjs';

const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ROTULO = { A_PAGAR: ['a pagar', 'aviso'], PAGO: ['pago', 'ok'], A_RECEBER: ['a receber', 'aviso'], RECEBIDO: ['recebido', 'ok'] };

export async function render(estado) {
  const meses = await api('GET', '/api/meses');
  const ym = escolherYm(estado, meses);
  if (!ym) return h('div', { class: 'card' }, 'Nenhum mês aberto ainda.');
  const v = await api('GET', `/api/meses/${ym}`);
  const admin = estado.user.perfil === 'ADMIN' && v.status === 'ABERTO';
  let filtro = 'TODOS';
  const lista = h('div', { class: 'card' });

  const linhaSaldo = (rotulo, sub, valorTxt, saldo, onclick) => h('div', { class: 'linha', onclick, style: onclick ? 'cursor:pointer' : '' },
    h('span', {}, rotulo, h('br'), h('span', { class: 'suave' }, sub)),
    h('span', { style: 'text-align:right' }, valorTxt, h('br'), h('span', { class: `suave ${saldo < 0 ? 'neg' : ''}` }, `saldo ${moeda(saldo)}`)));

  const desenhar = () => {
    const itens = [
      h('div', { class: 'linha' }, h('span', {}, 'Saldo banco', h('br'), h('span', { class: 'suave' }, 'saldo inicial')),
        h('span', { class: v.saldo_inicial_centavos < 0 ? 'neg' : '' }, moeda(v.saldo_inicial_centavos))),
      ...v.lancamentos.filter((l) => filtro === 'TODOS' || l.tipo === filtro).map((l) => {
        const [txt, cls] = ROTULO[l.status];
        return linhaSaldo(rotuloLancamento(l),
          [dm(l.vencimento), ' · ', l.forma, ' ', h('span', { class: `tag ${cls}` }, txt)],
          (l.tipo === 'CREDITO' ? '+' : '') + moeda(l.valor_centavos), l.saldo_centavos,
          admin ? () => { location.hash = `#/lancamento/${l.id}`; } : null);
      }),
      ...(filtro !== 'DEBITO' ? v.aportes.map((a) => linhaSaldo(`Aporte ${a.nome} (${a.bp / 100}%)`,
        [dm(a.vencimento), ' · PIX ', h('span', { class: `tag ${a.status === 'PAGO' ? 'ok' : 'aviso'}` }, v.provisorio ? 'provisório' : (a.status === 'PAGO' ? 'recebido' : 'a receber'))],
        `+${moeda(a.final_centavos)}`, a.saldo_centavos, null)) : []),
    ];
    lista.replaceChildren(...itens);
  };
  const chip = (rotulo, valor) => h('span', { class: 'chip', onclick: (ev) => {
    filtro = valor;
    ev.target.parentNode.querySelectorAll('.chip').forEach((c) => c.classList.remove('sel'));
    ev.target.classList.add('sel'); desenhar();
  } }, rotulo);
  const chips = h('div', { class: 'chips' }, chip('Todos', 'TODOS'), chip('Débitos', 'DEBITO'), chip('Créditos', 'CREDITO'));
  chips.firstChild.classList.add('sel');
  desenhar();

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Lançamentos'), seletorMes(estado, meses, ym)),
    chips, h('div', { style: 'height:10px' }), lista,
    admin ? h('button', { class: 'fab', 'aria-label': 'Novo lançamento', onclick: () => { location.hash = `#/lancamento/novo?ym=${ym}`; } }, '+') : null);
}
