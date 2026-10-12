import { h, toast, confirmar } from '../ui.mjs';
import { api } from '../api.mjs';
import { nomeDoMes } from '../cobranca.mjs';

const pct = (bp) => `${(bp / 100).toString().replace('.', ',')}%`;

export async function render(estado) {
  const socios = await api('GET', '/api/socios');
  const admin = estado.user.perfil === 'ADMIN';
  let usuarios = [];
  if (admin) { try { usuarios = await api('GET', '/api/usuarios'); } catch (e) { if (e.status !== 403) throw e; } }
  const ativos = socios.filter((s) => s.ativo);
  const soma = ativos.reduce((s, x) => s + x.bp_atual, 0);
  const parsePct = (txt) => {
    const t = String(txt).trim().replace(',', '.');
    if (t === '') return 0;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  };
  const recarregar = () => window.dispatchEvent(new Event('hashchange'));

  const dialogo = (titulo, campos, aoSalvar) => {
    const d = h('dialog', {}, h('h3', {}, titulo), ...campos,
      h('div', { class: 'acoes' }, h('button', { class: 'sec', onclick: () => d.close() }, 'Cancelar'),
        h('button', { onclick: async () => { try { await aoSalvar(); d.close(); recarregar(); } catch (e) { toast(e.message); } } }, 'Salvar')));
    d.addEventListener('close', () => d.remove());
    document.body.append(d); d.showModal();
  };

  const novoSocio = () => {
    const nome = h('input', { maxlength: 60 });
    const usu = h('select', {}, h('option', { value: '' }, '(sem acesso ao app)'), usuarios.filter((u) => u.ativo).map((u) => h('option', { value: u.id }, u.nome)));
    dialogo('Novo sócio', [h('label', {}, 'Nome'), nome, h('label', {}, 'Usuário vinculado'), usu],
      () => api('POST', '/api/socios', { nome: nome.value, usuario_id: usu.value ? Number(usu.value) : null }));
  };
  const editarSocio = (s) => {
    const nome = h('input', { value: s.nome });
    const usu = h('select', {}, h('option', { value: '' }, '(sem acesso ao app)'), usuarios.filter((u) => u.ativo).map((u) => h('option', { value: u.id, selected: u.id === s.usuario_id }, u.nome)));
    dialogo(`Editar ${s.nome}`, [h('label', {}, 'Nome'), nome, h('label', {}, 'Usuário vinculado'), usu],
      () => api('PUT', `/api/socios/${s.id}`, { nome: nome.value, usuario_id: usu.value ? Number(usu.value) : null }));
  };
  const excluir = async (s) => {
    if (!(await confirmar(`Excluir ${s.nome}? Se houver histórico, ele será apenas inativado.`, 'Excluir'))) return;
    try { const r = await api('DELETE', `/api/socios/${s.id}`); toast(r.inativado ? 'Sócio inativado (tem histórico)' : 'Sócio excluído'); recarregar(); }
    catch (e) { toast(e.message); }
  };
  const alterarPercentuais = () => {
    const mes = h('input', { type: 'month', value: new Date().toISOString().slice(0, 7) });
    const campos = ativos.map((s) => ({ s, el: h('input', { inputmode: 'decimal', value: String(s.bp_atual / 100).replace('.', ',') }) }));
    const total = h('p', { class: 'suave' }, '');
    const atualiza = () => {
      const t = campos.reduce((a, c) => a + (parsePct(c.el.value) || 0), 0);
      total.textContent = `Soma: ${pct(t)}${t === 10000 ? '' : ' (precisa ser 100%)'}`;
    };
    campos.forEach((c) => c.el.addEventListener('input', atualiza)); atualiza();
    dialogo('Alterar percentuais', [h('label', {}, 'Vale a partir de'), mes,
      ...campos.flatMap((c) => [h('label', {}, c.s.nome), c.el]), total],
    () => {
      const itens = campos.map((c) => ({ socio_id: c.s.id, bp: parsePct(c.el.value) }));
      if (itens.some((i) => i.bp === null)) throw new Error('Percentual inválido');
      return api('POST', '/api/percentuais', { vigente_desde: mes.value, itens });
    });
  };

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Sócios'), h('a', { href: '#/mais' }, 'Voltar')),
    h('div', { class: 'card' }, ativos.map((s) => h('div', { class: 'linha' },
      h('span', {}, s.nome, h('br'), h('span', { class: 'suave' }, s.historico.map((x) => `${nomeDoMes(x.vigente_desde)}: ${pct(x.bp)}`).join(' → '))),
      h('span', {}, pct(s.bp_atual), admin ? [' ', h('a', { href: '#/socios', onclick: (e) => { e.preventDefault(); editarSocio(s); } }, 'editar'),
        ' ', h('a', { href: '#/socios', onclick: (e) => { e.preventDefault(); excluir(s); } }, 'excluir')] : null))),
    h('div', { class: 'linha' }, h('b', {}, 'Total'), h('b', { class: soma === 10000 ? 'pos' : 'neg' }, pct(soma)))),
    admin ? h('div', { class: 'acoes' }, h('button', { class: 'sec', onclick: novoSocio }, 'Novo sócio'), h('button', { onclick: alterarPercentuais }, 'Alterar percentuais')) : null,
    socios.some((s) => !s.ativo) ? h('p', { class: 'suave' }, `Inativos: ${socios.filter((s) => !s.ativo).map((s) => s.nome).join(', ')}`) : null);
}
