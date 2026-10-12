import { formatBRL } from './money.mjs';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function nomeDoMes(ym) {
  const [a, m] = ym.split('-');
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
}

const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function textoCobranca(visao, ym) {
  const pend = visao.aportes.filter((a) => a.status !== 'PAGO');
  if (!pend.length) return `Aportes de ${nomeDoMes(ym)}: todos recebidos.`;
  const linhas = pend.map((a) => `• ${a.nome}: R$ ${formatBRL(a.final_centavos)} (vence ${dm(a.vencimento)})`);
  return `Aportes de ${nomeDoMes(ym)} pendentes:\n${linhas.join('\n')}\nPagamento por PIX.`;
}
