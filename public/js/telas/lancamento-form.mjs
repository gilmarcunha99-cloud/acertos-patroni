import { h, toast, confirmar } from '../ui.mjs';
import { api } from '../api.mjs';
import { parseBRL, formatBRL } from '../money.mjs';

export async function render(estado) {
  const arg = estado.arg || 'novo';
  const novo = arg.startsWith('novo');
  const ym = novo ? new URLSearchParams(arg.split('?')[1]).get('ym') : null;
  let l = { tipo: 'DEBITO', descritivo: '', valor_centavos: 0, vencimento: `${ym || estado.ym}-15`, forma: 'BOLETO', recorrencia: 'NENHUMA', parcela_atual: null, parcela_total: null, status: 'A_PAGAR' };
  if (!novo) {
    const meses = await api('GET', '/api/meses');
    for (const m of meses) {
      const v = await api('GET', `/api/meses/${m.ym}`);
      const achou = v.lancamentos.find((x) => String(x.id) === arg);
      if (achou) { l = achou; break; }
    }
  }
  const tipo = h('select', {}, h('option', { value: 'DEBITO', selected: l.tipo === 'DEBITO' }, 'Débito'), h('option', { value: 'CREDITO', selected: l.tipo === 'CREDITO' }, 'Crédito'));
  const desc = h('input', { value: l.descritivo, maxlength: 80 });
  const valor = h('input', { inputmode: 'decimal', value: l.valor_centavos ? formatBRL(l.valor_centavos) : '' });
  const venc = h('input', { type: 'date', value: l.vencimento });
  const forma = h('select', {}, ['BOLETO', 'GUIA', 'PIX', 'OUTRO'].map((f) => h('option', { value: f, selected: l.forma === f }, f)));
  const rec = h('select', {}, [['NENHUMA', 'Só este mês'], ['FIXO', 'Fixo (repete todo mês)'], ['PARCELADO', 'Parcelado']].map(([v, t]) => h('option', { value: v, selected: l.recorrencia === v }, t)));
  const pa = h('input', { type: 'number', min: 1, value: l.parcela_atual || '' });
  const pt = h('input', { type: 'number', min: 1, value: l.parcela_total || '' });
  const blocoParcela = h('div', { class: 'grade' }, h('div', {}, h('label', {}, 'Parcela atual'), pa), h('div', {}, h('label', {}, 'Total de parcelas'), pt));
  const sit = h('select', {}, [['A_PAGAR', 'A pagar'], ['PAGO', 'Pago'], ['A_RECEBER', 'A receber'], ['RECEBIDO', 'Recebido']].map(([v, t]) => h('option', { value: v, selected: l.status === v }, t)));
  const ajustar = () => { blocoParcela.hidden = rec.value !== 'PARCELADO'; };
  rec.addEventListener('change', ajustar); ajustar();

  const salvar = async () => {
    const c = parseBRL(valor.value);
    if (c === null || c < 0) return toast('Informe um valor válido, como 1.234,56');
    const corpo = { tipo: tipo.value, descritivo: desc.value, valor_centavos: c, vencimento: venc.value, forma: forma.value, recorrencia: rec.value,
      parcela_atual: rec.value === 'PARCELADO' ? Number(pa.value) : null, parcela_total: rec.value === 'PARCELADO' ? Number(pt.value) : null, status: sit.value };
    try {
      if (novo) await api('POST', `/api/meses/${ym}/lancamentos`, { ...corpo, status: tipo.value === 'DEBITO' ? 'A_PAGAR' : 'A_RECEBER' });
      else await api('PUT', `/api/lancamentos/${arg}`, corpo);
      toast('Lançamento salvo'); location.hash = '#/lancamentos';
    } catch (e) { toast(e.message); }
  };
  const excluir = async () => {
    if (!(await confirmar('Excluir este lançamento?', 'Excluir'))) return;
    try { await api('DELETE', `/api/lancamentos/${arg}`); location.hash = '#/lancamentos'; } catch (e) { toast(e.message); }
  };

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, novo ? 'Novo lançamento' : 'Editar lançamento'), h('a', { href: '#/lancamentos' }, 'Cancelar')),
    h('div', { class: 'card' },
      h('label', {}, 'Tipo'), tipo, h('label', {}, 'Descritivo'), desc, h('label', {}, 'Valor (R$)'), valor,
      h('label', {}, 'Vencimento'), venc, h('label', {}, 'Forma de pagamento'), forma,
      h('label', {}, 'Repetição'), rec, blocoParcela,
      novo ? null : [h('label', {}, 'Situação'), sit]),
    h('button', { class: 'largo', onclick: salvar }, 'Salvar lançamento'),
    novo ? null : h('button', { class: 'largo perigo', style: 'margin-top:10px', onclick: excluir }, 'Excluir'));
}
