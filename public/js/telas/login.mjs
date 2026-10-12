import { h, toast } from '../ui.mjs';
import { api } from '../api.mjs';

export async function render(estado) {
  const email = h('input', { type: 'email', autocomplete: 'username', required: true });
  const senha = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const form = h('form', { class: 'card', onsubmit: async (ev) => {
    ev.preventDefault();
    try {
      estado.user = await api('POST', '/api/login', { email: email.value, senha: senha.value });
      estado.irPara('#/painel');
    } catch (e) { toast(e.message); }
  } },
  h('h1', {}, 'Acertos Patroni'),
  h('label', {}, 'E-mail'), email, h('label', {}, 'Senha'), senha,
  h('div', { class: 'acoes' }, h('button', { class: 'largo' }, 'Entrar')));
  return h('div', {}, form);
}
