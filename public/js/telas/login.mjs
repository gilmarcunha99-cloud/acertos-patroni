import { h, toast, campoSenha, icone } from '../ui.mjs';
import { api } from '../api.mjs';
import { botaoInstalar } from '../instalar.mjs';
import { digitalDisponivel, entrarComDigital, travaAtiva, foiCancelado, credencialDoAparelho } from '../digital.mjs';

// A trava ao abrir pede a digital uma vez por carregamento do app; se a
// pessoa cancelar, fica a tela de login com o botão.
let travaTentada = false;

export async function render(estado) {
  const aposEntrar = async (usuario) => {
    estado.user = usuario;
    try { await caches.delete('api'); } catch { /* sem cache */ }
    estado.irPara('#/painel');
  };

  const email = h('input', { id: 'login', type: 'text', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
  const senha = h('input', { id: 'senha', type: 'password', autocomplete: 'current-password', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
  const entrar = h('button', { class: 'largo' }, 'Entrar');
  const form = h('form', { onsubmit: async (ev) => {
    ev.preventDefault();
    entrar.disabled = true;
    try { await aposEntrar(await api('POST', '/api/login', { email: email.value.trim(), senha: senha.value })); }
    catch (e) { toast(e.message); entrar.disabled = false; }
  } },
  h('label', { for: 'login' }, 'Login'), email,
  h('label', { for: 'senha' }, 'Senha'), campoSenha(senha),
  entrar);

  const comDigital = async (botao) => {
    if (botao) botao.disabled = true;
    try { await aposEntrar(await entrarComDigital()); }
    catch (e) {
      if (!foiCancelado(e)) toast(e.message || 'Não foi possível entrar com a digital. Entre com login e senha.');
      if (botao) botao.disabled = false;
    }
  };
  const lugarDigital = h('div', { class: 'lugar-digital' });
  digitalDisponivel().then((sim) => {
    if (!sim) return;
    const botao = h('button', { type: 'button', class: 'largo', onclick: () => comDigital(botao) }, icone('digital', 22), 'Entrar com digital');
    lugarDigital.replaceChildren(botao, h('p', { class: 'ou' }, credencialDoAparelho() ? 'ou entre com login e senha' : 'ou'));
    if (!travaTentada && travaAtiva()) { travaTentada = true; comDigital(botao); }
  });

  return h('div', { class: 'entrada' },
    h('div', { class: 'marca' }, h('div', { class: 'marca-icone' }, icone('balanca', 26)), h('span', { class: 'marca-nome' }, 'Acertos Patroni')),
    h('div', {}, h('h2', {}, 'Entrar'), h('p', { class: 'sub' }, 'Acertos mensais entre os sócios')),
    lugarDigital,
    form,
    botaoInstalar());
}
