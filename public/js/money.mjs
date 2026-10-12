export function parseBRL(s) {
  const t = String(s).trim().replace(/\s|R\$/g, '');
  if (!/^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$/.test(t)) return null;
  const neg = t.startsWith('-');
  const [i, d = ''] = t.replace('-', '').replace(/\./g, '').split(',');
  const c = Number(i) * 100 + Number(d.padEnd(2, '0'));
  return neg ? -c : c;
}

export function formatBRL(c) {
  const neg = c < 0;
  const a = Math.abs(c);
  const i = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + i + ',' + String(a % 100).padStart(2, '0');
}
