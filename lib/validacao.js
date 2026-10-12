const { fail } = require('./router');

const ymValido = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s));
const dataValida = (s) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s));

const LIMITE_CENTAVOS = 2147483647;
const centavosValido = (n) => Number.isInteger(n) && Math.abs(n) <= LIMITE_CENTAVOS;

const TIPOS = ['DEBITO', 'CREDITO'];
const FORMAS = ['BOLETO', 'GUIA', 'PIX', 'OUTRO'];
const RECORRENCIAS = ['NENHUMA', 'FIXO', 'PARCELADO'];
const STATUS = { DEBITO: ['A_PAGAR', 'PAGO'], CREDITO: ['A_RECEBER', 'RECEBIDO'] };

function lancamentoValido(b) {
  if (!TIPOS.includes(b.tipo)) fail(400, 'Informe se é débito ou crédito.');
  if (!String(b.descritivo || '').trim()) fail(400, 'Informe o descritivo.');
  if (!Number.isInteger(b.valor_centavos) || b.valor_centavos < 0) fail(400, 'Informe um valor válido.');
  if (!centavosValido(b.valor_centavos)) fail(400, 'Valor fora do limite.');
  if (!dataValida(b.vencimento)) fail(400, 'Informe um vencimento válido.');
  if (!FORMAS.includes(b.forma)) fail(400, 'Escolha a forma de pagamento.');
  const recorrencia = b.recorrencia || 'NENHUMA';
  if (!RECORRENCIAS.includes(recorrencia)) fail(400, 'Recorrência inválida.');
  const status = b.status || STATUS[b.tipo][0];
  if (!STATUS[b.tipo].includes(status)) fail(400, 'Situação inválida para este tipo.');
  let atual = null; let total = null;
  if (recorrencia === 'PARCELADO') {
    atual = b.parcela_atual; total = b.parcela_total;
    if (!Number.isInteger(atual) || !Number.isInteger(total) || atual < 1 || total < atual) fail(400, 'Informe a parcela atual e o total.');
  }
  return { tipo: b.tipo, descritivo: b.descritivo.trim(), valor_centavos: b.valor_centavos, vencimento: b.vencimento,
    forma: b.forma, status, recorrencia, parcela_atual: atual, parcela_total: total };
}

module.exports = { centavosValido, ymValido, dataValida, lancamentoValido };
