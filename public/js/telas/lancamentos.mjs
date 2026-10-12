import { h, moeda, caixaData, icone, toast } from '../ui.mjs';
import { api } from '../api.mjs';
import { escolherYm, seletorMes, rotuloLancamento } from './seletor-mes.mjs';

const ROTULO = { A_PAGAR: ['a pagar', 'aviso'], PAGO: ['pago', 'ok'], A_RECEBER: ['a receber', 'aviso'], RECEBIDO: ['recebido', 'ok'] };
const FORMA = { BOLETO: 'Boleto', GUIA: 'Guia', PIX: 'PIX', OUTRO: 'Outro' };

export async function render(estado) {
  const meses = await api('GET', '/api/meses');
  const ym = escolherYm(estado, meses);
  if (!ym) return h('div', { class: 'card' }, 'Nenhum mês aberto ainda.');
  const v = await api('GET', `/api/meses/${ym}`);
  const ehAdmin = estado.user.perfil === 'ADMIN';
  const admin = ehAdmin && v.status === 'ABERTO';
  // Pagar vale em qualquer mês (inclusive fechado); editar o resto, só no aberto.
  const OPOSTA = { A_PAGAR: 'PAGO', PAGO: 'A_PAGAR', A_RECEBER: 'RECEBIDO', RECEBIDO: 'A_RECEBER' };
  const situacao = (l) => {
    const [txt, cls] = ROTULO[l.status];
    if (!ehAdmin) return h('span', { class: `tag ${cls}` }, txt);
    const nova = OPOSTA[l.status];
    return h('button', { type: 'button', class: `tag ${cls} tag-botao`,
      'aria-label': `${rotuloLancamento(l)}: ${txt}. Tocar para marcar como ${ROTULO[nova][0]}`,
      onclick: async (ev) => {
        ev.stopPropagation();
        ev.currentTarget.disabled = true;
        try {
          await api('PUT', `/api/lancamentos/${l.id}/situacao`, { status: nova });
          toast(`${rotuloLancamento(l)}: ${ROTULO[nova][0]}`);
          window.dispatchEvent(new Event('hashchange'));
        } catch (e) { toast(e.message); ev.currentTarget.disabled = false; }
      } }, txt);
  };
  let filtro = 'TODOS';
  const lista = h('div', { class: 'card lista' });

  const linha = ({ data, titulo, tags, valor, saldo, credito, abrir }) => h('div', {
    class: 'linha', role: abrir ? 'button' : false, tabindex: abrir ? '0' : false, onclick: abrir,
    onkeydown: abrir ? (ev) => { if (ev.key === 'Enter') abrir(); } : null,
  },
  caixaData(data),
  h('div', { class: 'textos' }, h('b', {}, titulo), h('div', { class: 'tags' }, tags)),
  h('div', { class: 'valor' }, h('b', { class: credito ? 'pos' : '' }, valor),
    saldo === null ? null : h('span', { class: `suave ${saldo < 0 ? 'neg' : ''}` }, `saldo ${moeda(saldo)}`)));

  const desenhar = () => {
    lista.replaceChildren(
      linha({ data: `${ym}-01`, titulo: 'Saldo do banco', tags: [h('span', { class: 'tag' }, 'saldo inicial')],
        valor: moeda(v.saldo_inicial_centavos), saldo: null }),
      ...v.lancamentos.filter((l) => filtro === 'TODOS' || l.tipo === filtro).map((l) => {
        return linha({ data: l.vencimento, titulo: rotuloLancamento(l),
          tags: [h('span', { class: 'tag' }, FORMA[l.forma] || l.forma), situacao(l)],
          valor: (l.tipo === 'CREDITO' ? '+' : '') + moeda(l.valor_centavos), saldo: l.saldo_centavos, credito: l.tipo === 'CREDITO',
          abrir: admin ? () => { location.hash = `#/lancamento/${l.id}`; } : null });
      }),
      ...(filtro !== 'DEBITO' ? v.aportes.map((a) => linha({ data: a.vencimento, titulo: `Aporte ${a.nome} · ${String(a.bp / 100).replace('.', ',')}%`,
        tags: [h('span', { class: 'tag' }, 'PIX'), v.provisorio ? h('span', { class: 'tag' }, 'provisório')
          : h('span', { class: `tag ${a.status === 'PAGO' ? 'ok' : 'aviso'}` }, a.status === 'PAGO' ? 'recebido' : 'a receber')],
        valor: `+${moeda(a.final_centavos)}`, saldo: a.saldo_centavos, credito: true })) : []),
    );
  };
  const chip = (rotulo, valor) => h('button', { type: 'button', class: 'chip', 'aria-pressed': valor === filtro ? 'true' : 'false', onclick: (ev) => {
    filtro = valor;
    ev.currentTarget.parentNode.querySelectorAll('.chip').forEach((c) => { c.classList.remove('sel'); c.setAttribute('aria-pressed', 'false'); });
    ev.currentTarget.classList.add('sel'); ev.currentTarget.setAttribute('aria-pressed', 'true'); desenhar();
  } }, rotulo);
  const chips = h('div', { class: 'chips' }, chip('Todos', 'TODOS'), chip('Débitos', 'DEBITO'), chip('Créditos', 'CREDITO'));
  chips.firstChild.classList.add('sel');
  desenhar();

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Lançamentos'), seletorMes(estado, meses, ym)),
    chips, lista,
    admin ? h('button', { class: 'fab', 'aria-label': 'Novo lançamento', onclick: () => { location.hash = `#/lancamento/novo?ym=${ym}`; } }, icone('mais_sinal', 28)) : null);
}
