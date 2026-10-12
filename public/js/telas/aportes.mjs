import { h, moeda, toast, confirmar } from '../ui.mjs';
import { api } from '../api.mjs';
import { parseBRL, formatBRL } from '../money.mjs';
import { textoCobranca } from '../cobranca.mjs';
import { escolherYm, seletorMes } from './seletor-mes.mjs';

const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function render(estado) {
  const meses = await api('GET', '/api/meses');
  const ym = escolherYm(estado, meses);
  if (!ym) return h('div', { class: 'card' }, 'Nenhum mês aberto ainda.');
  const v = await api('GET', `/api/meses/${ym}`);
  const admin = estado.user.perfil === 'ADMIN';
  const recarregar = () => window.dispatchEvent(new Event('hashchange'));

  const alternarPago = async (a) => {
    try { await api('PUT', `/api/meses/${ym}/aportes/${a.socio_id}`, { status: a.status === 'PAGO' ? 'PENDENTE' : 'PAGO' }); recarregar(); }
    catch (e) { toast(e.message); }
  };
  const editarAjuste = async (a) => {
    const valor = h('input', { inputmode: 'decimal', value: a.ajuste_centavos ? formatBRL(a.ajuste_centavos) : '', placeholder: '-302,25' });
    const motivo = h('input', { value: a.ajuste_motivo || '', placeholder: 'Acerto de setembro entre Lígia e Henrique' });
    const origem = h('input', { type: 'month', value: a.ajuste_origem || '' });
    const d = h('dialog', {}, h('h3', {}, `Acerto de ${a.nome}`),
      h('label', {}, 'Valor do acerto (R$, negativo reduz o aporte)'), valor, h('label', {}, 'Motivo'), motivo, h('label', {}, 'Mês de origem'), origem,
      h('div', { class: 'acoes' }, h('button', { class: 'sec', onclick: () => d.close() }, 'Cancelar'),
        h('button', { onclick: async () => {
          const c = valor.value.trim() ? parseBRL(valor.value) : 0;
          if (c === null) return toast('Informe um valor válido');
          try { await api('PUT', `/api/meses/${ym}/aportes/${a.socio_id}`, { ajuste_centavos: c, ajuste_motivo: motivo.value, ajuste_origem: origem.value }); d.close(); recarregar(); }
          catch (e) { toast(e.message); }
        } }, 'Salvar')));
    d.addEventListener('close', () => d.remove());
    document.body.append(d); d.showModal();
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoCobranca(v, ym)); toast('Texto copiado'); }
    catch { toast('Não foi possível copiar'); }
  };

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Aportes'), seletorMes(estado, meses, ym)),
    h('div', { class: 'card' }, h('div', { class: 'suave' }, v.provisorio ? 'Total a aportar (provisório)' : 'Total a aportar'),
      h('div', { class: 'grande' }, moeda(v.totais.aportes)),
      v.totais.diferenca !== 0 ? h('div', { class: 'suave neg' }, `Diferença para o valor a cobrir: ${moeda(v.totais.diferenca)}`) : null),
    h('div', { class: 'card' }, v.aportes.length ? v.aportes.map((a) => h('div', { class: 'linha' },
      h('span', {}, `${a.nome} · ${a.bp / 100}%`, h('br'), h('span', { class: 'suave' }, `vence ${dm(a.vencimento)}`),
        a.ajuste_centavos ? h('br') : null,
        a.ajuste_centavos ? h('span', { class: 'suave' }, `acerto ${moeda(a.ajuste_centavos)}: ${a.ajuste_motivo}`) : null),
      h('span', { style: 'text-align:right' }, moeda(a.final_centavos), h('br'),
        v.provisorio ? h('span', { class: 'tag' }, 'provisório')
          : h('span', { class: `tag ${a.status === 'PAGO' ? 'ok' : 'aviso'}`, style: admin ? 'cursor:pointer' : '', onclick: admin ? () => alternarPago(a) : null }, a.status === 'PAGO' ? 'pago' : 'pendente'),
        admin && v.status === 'ABERTO' ? [h('br'), h('a', { href: '#/aportes', onclick: (ev) => { ev.preventDefault(); editarAjuste(a); } }, 'acerto')] : null)))
      : h('p', { class: 'suave' }, 'Defina os percentuais dos sócios em Mais → Sócios.')),
    h('button', { class: 'largo', onclick: copiar }, 'Copiar cobrança para o WhatsApp'));
}
