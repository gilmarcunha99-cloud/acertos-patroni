function proximoYm(ym) {
  const [a, m] = ym.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

function ultimoDia(ym) {
  const [a, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

function moverParaMes(dataIso, ym) {
  const dia = Math.min(Number(dataIso.slice(8, 10)), ultimoDia(ym));
  return `${ym}-${String(dia).padStart(2, '0')}`;
}

module.exports = { proximoYm, moverParaMes };
