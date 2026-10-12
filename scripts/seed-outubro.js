const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const q = async (s, p = []) => (await pool.query(s, p)).rows;
  if ((await q("SELECT 1 FROM mes WHERE ym = '2026-10'")).length) { console.log('2026-10 já existe'); return pool.end(); }
  await q("INSERT INTO mes (ym, saldo_inicial_centavos) VALUES ('2026-10', -1623)");
  const L = [
    ['Contabilidade', 26700, '2026-10-15', 'BOLETO', 'FIXO', null, null],
    ['Condominio Boulevard Shopping', 338304, '2026-10-20', 'BOLETO', 'PARCELADO', 7, 24],
    ['ICMS', 155521, '2026-10-25', 'GUIA', 'PARCELADO', 17, 119],
    ['DASN', 30225, '2026-10-25', 'GUIA', 'PARCELADO', 2, 58],
  ];
  let ordem = 0;
  for (const [d, v, venc, forma, rec, pa, pt] of L) {
    ordem += 1;
    await q(`INSERT INTO lancamento (ym, tipo, descritivo, valor_centavos, vencimento, forma, status, ordem, recorrencia, parcela_atual, parcela_total)
             VALUES ('2026-10','DEBITO',$1,$2,$3,$4,'A_PAGAR',$5,$6,$7,$8)`, [d, v, venc, forma, ordem, rec, pa, pt]);
  }
  console.log('outubro/26 carregado');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
