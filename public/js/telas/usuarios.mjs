import { h, toast, confirmar } from '../ui.mjs';
import { api } from '../api.mjs';

export async function render(estado) {
  let lista;
  try { lista = await api('GET', '/api/usuarios'); }
  catch (e) {
    if (e.status === 403) return h('div', { class: 'card' }, 'Somente o administrador acessa esta tela.');
    throw e;
  }
  const recarregar = () => window.dispatchEvent(new Event('hashchange'));
  const dialogo = (titulo, campos, aoSalvar) => {
    const d = h('dialog', {}, h('h3', {}, titulo), ...campos,
      h('div', { class: 'acoes' }, h('button', { class: 'sec', onclick: () => d.close() }, 'Cancelar'),
        h('button', { onclick: async () => { try { await aoSalvar(); d.close(); recarregar(); } catch (e) { toast(e.message); } } }, 'Salvar')));
    d.addEventListener('close', () => d.remove());
    document.body.append(d); d.showModal();
  };
  const formulario = (u) => {
    const nome = h('input', { value: u ? u.nome : '' });
    const email = h('input', { type: 'email', value: u ? u.email : '' });
    const perfil = h('select', {}, [['SOCIO', 'Sócio (somente consulta)'], ['ADMIN', 'Administrador']].map(([v, t]) => h('option', { value: v, selected: u && u.perfil === v }, t)));
    const senha = h('input', { type: 'password', autocomplete: 'new-password', placeholder: u ? 'deixe em branco para manter' : 'mínimo 8 caracteres' });
    const ativo = h('select', {}, [[true, 'Ativo'], [false, 'Inativo']].map(([v, t]) => h('option', { value: String(v), selected: u ? u.ativo === v : v }, t)));
    const campos = [h('label', {}, 'Nome'), nome, h('label', {}, 'E-mail'), email, h('label', {}, 'Perfil'), perfil, h('label', {}, 'Senha'), senha];
    if (u) campos.push(h('label', {}, 'Situação'), ativo);
    dialogo(u ? `Editar ${u.nome}` : 'Novo usuário', campos, () => {
      const corpo = { nome: nome.value, email: email.value, perfil: perfil.value };
      if (senha.value) corpo.senha = senha.value;
      if (!u) return api('POST', '/api/usuarios', corpo);
      corpo.ativo = ativo.value === 'true';
      return api('PUT', `/api/usuarios/${u.id}`, corpo);
    });
  };
  const excluir = async (u) => {
    if (!(await confirmar(`Excluir ${u.nome}?`, 'Excluir'))) return;
    try { const r = await api('DELETE', `/api/usuarios/${u.id}`); toast(r.inativado ? 'Usuário inativado (está ligado a um sócio)' : 'Usuário excluído'); recarregar(); }
    catch (e) { toast(e.message); }
  };
  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Usuários'), h('a', { href: '#/mais' }, 'Voltar')),
    h('div', { class: 'card' }, lista.map((u) => h('div', { class: 'linha' },
      h('span', {}, u.nome, h('br'), h('span', { class: 'suave' }, `${u.email} · ${u.perfil === 'ADMIN' ? 'administrador' : 'sócio'}${u.ativo ? '' : ' · inativo'}`)),
      h('span', {}, h('a', { href: '#/usuarios', onclick: (e) => { e.preventDefault(); formulario(u); } }, 'editar'), ' ',
        h('a', { href: '#/usuarios', onclick: (e) => { e.preventDefault(); excluir(u); } }, 'excluir'))))),
    h('button', { class: 'largo', onclick: () => formulario(null) }, 'Novo usuário'));
}
