import { h, moeda, corSaldo, confirmar, toast } from '../ui.mjs';
import { api } from '../api.mjs';
import { escolherYm, seletorMes, rotuloLancamento } from './seletor-mes.mjs';

const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function render(estado) {
  const meses = await api('GET', '/api/meses');
  const ym = escolherYm(estado, meses);
  const admin = estado.user.perfil === 'ADMIN';
  if (!ym) return h('div', { class: 'card' }, h('p', {}, 'Nenhum mês aberto ainda.'),
    admin ? h('a', { class: 'btn', href: '#/meses' }, 'Abrir o primeiro mês') : null);
  const v = await api('GET', `/api/meses/${ym}`);
  const pagos = v.aportes.filter((a) => a.status === 'PAGO').length;
  const recebido = v.aportes.filter((a) => a.status === 'PAGO').reduce((s, a) => s + a.final_centavos, 0);
  const proximos = v.lancamentos.filter((l) => l.status === 'A_PAGAR').slice(0, 3);

  const fechar = async () => {
    if (!(await confirmar(`Fechar ${ym}? Os aportes serão calculados e o mês fica somente leitura.`, 'Fechar mês'))) return;
    try { await api('POST', `/api/meses/${ym}/fechar`, {}); }
    catch (e) {
      if (e.dados && e.dados.diferenca_centavos !== undefined) {
        if (!(await confirmar(`${e.message} Diferença: R$ ${moeda(e.dados.diferenca_centavos)}.`, 'Fechar assim mesmo'))) return;
        await api('POST', `/api/meses/${ym}/fechar`, { confirmar_diferenca: true });
      } else { return toast(e.message); }
    }
    toast('Mês fechado'); window.dispatchEvent(new Event('hashchange'));
  };

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Painel'), seletorMes(estado, meses, ym)),
    h('div', { class: 'card' },
      h('div', { class: 'suave' }, v.status === 'FECHADO' ? 'Mês fechado' : 'Mês aberto · aportes provisórios'),
      h('div', { class: 'suave' }, 'Saldo ao fim do mês'),
      h('div', { class: `grande ${corSaldo(v.totais.saldo_final)}` }, `R$ ${moeda(v.totais.saldo_final)}`),
      h('div', { class: 'suave' }, `Saldo do banco no início: R$ ${moeda(v.saldo_inicial_centavos)}`)),
    h('div', { class: 'grade' },
      h('div', { class: 'card' }, h('div', { class: 'suave' }, 'Débitos'), h('b', {}, moeda(v.totais.debitos))),
      h('div', { class: 'card' }, h('div', { class: 'suave' }, 'Aportes'), h('b', {}, moeda(v.totais.aportes)))),
    v.status === 'FECHADO' ? h('div', { class: 'card' },
      h('div', { class: 'suave' }, 'Aportes recebidos'),
      h('div', { class: 'barra' }, h('b', { style: `width:${v.totais.aportes ? Math.round(recebido * 100 / v.totais.aportes) : 0}%` })),
      h('div', { class: 'suave' }, `${pagos} de ${v.aportes.length} sócios · ${moeda(recebido)} de ${moeda(v.totais.aportes)}`)) : null,
    h('div', { class: 'card' }, h('div', { class: 'suave' }, 'Próximos vencimentos'),
      proximos.length ? proximos.map((l) => h('div', { class: 'linha' },
        h('span', {}, rotuloLancamento(l), h('br'), h('span', { class: 'suave' }, `${dm(l.vencimento)} · ${l.forma}`)),
        h('span', {}, moeda(l.valor_centavos)))) : h('p', { class: 'suave' }, 'Nada a pagar.')),
    admin && v.status === 'ABERTO' ? h('button', { class: 'largo', onclick: fechar }, 'Fechar mês') : null);
}
