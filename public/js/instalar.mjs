import { h, toast, icone } from './ui.mjs';

// O Chrome do Android avisa (beforeinstallprompt) quando o app pode ser
// instalado. O aviso chega uma vez, a qualquer momento, então ele é guardado
// aqui desde o carregamento e usado quando a pessoa tocar no botão.
let pedido = null;
window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); pedido = ev; });
window.addEventListener('appinstalled', () => {
  pedido = null;
  document.querySelectorAll('.instalar').forEach((b) => b.remove());
  toast('App instalado');
});

const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ua = navigator.userAgent;
const ehIphone = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Navegadores embutidos (WhatsApp, Instagram, Facebook, Gmail) não instalam.
const ehEmbutido = /FBAN|FBAV|Instagram|WhatsApp|Line\/|GSA\//.test(ua) || /; wv\)/.test(ua);

function passoAPasso() {
  const passos = ehEmbutido
    ? ['Este link abriu dentro de outro app (WhatsApp, e-mail…), que não instala.', 'Toque nos três pontinhos e escolha "Abrir no navegador" (Chrome ou Safari).', 'No navegador, toque de novo em "Instalar app".']
    : ehIphone
      ? ['Abra este endereço no Safari.', 'Toque no botão Compartilhar (o quadrado com a seta para cima).', 'Escolha "Adicionar à Tela de Início" e confirme em "Adicionar".']
      : ['No Chrome, toque no menu ⋮ (canto superior direito).', 'Escolha "Instalar app". Se aparecer "Adicionar à tela inicial", toque nele e escolha "Instalar", não "Criar atalho".', 'Se já existir um atalho antigo na tela inicial, apague-o antes.'];
  const d = h('dialog', {}, h('h3', {}, 'Instalar o Acertos Patroni'),
    h('ol', { class: 'passos' }, passos.map((p) => h('li', {}, p))),
    h('div', { class: 'acoes' }, h('button', { onclick: () => d.close() }, 'Entendi')));
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}

export function botaoInstalar() {
  if (instalado()) return null;
  return h('button', { type: 'button', class: 'sec largo instalar', onclick: async () => {
    if (!pedido) return passoAPasso();
    const ev = pedido;
    pedido = null;
    ev.prompt();
    try { await ev.userChoice; } catch { /* a pessoa fechou */ }
  } }, icone('baixar', 20), 'Instalar app');
}
