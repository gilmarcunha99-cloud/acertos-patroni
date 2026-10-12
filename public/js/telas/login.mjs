import { h, toast, campoSenha, icone } from '../ui.mjs';
import { api } from '../api.mjs';

export async function render(estado) {
  const email = h('input', { id: 'login', type: 'text', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
  const senha = h('input', { id: 'senha', type: 'password', autocomplete: 'current-password', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
  const entrar = h('button', { class: 'largo' }, 'Entrar');
  const form = h('form', { onsubmit: async (ev) => {
    ev.preventDefault();
    entrar.disabled = true;
    try {
      estado.user = await api('POST', '/api/login', { email: email.value.trim(), senha: senha.value });
      try { await caches.delete('api'); } catch { /* sem cache */ }
      estado.irPara('#/painel');
    } catch (e) { toast(e.message); entrar.disabled = false; }
  } },
  h('label', { for: 'login' }, 'Login'), email,
  h('label', { for: 'senha' }, 'Senha'), campoSenha(senha),
  entrar);
  return h('div', { class: 'entrada' },
    h('div', { class: 'marca' }, h('div', { class: 'marca-icone' }, icone('balanca', 26)), h('span', { class: 'marca-nome' }, 'Acertos Patroni')),
    h('div', {}, h('h2', {}, 'Entrar'), h('p', { class: 'sub' }, 'Acertos mensais entre os sócios')),
    form);
}
