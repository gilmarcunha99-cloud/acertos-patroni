# Acertos Patroni Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA de celular que substitui a planilha "ACERTOS PATRONI": o ADMIN lança o mês, o app calcula saldo corrido e aportes por percentual, e os sócios consultam.

**Architecture:** Repositório novo, projeto Vercel novo. Uma única função serverless (`api/index.js`) despacha para um roteador próprio (`lib/router.js`) com handlers em `routes/`. Regras de negócio são funções puras em `lib/` (testadas sem banco). PostgreSQL (Neon via Marketplace da Vercel). Front-end em ES modules (`.mjs`) sem build, servido de `public/`, com service worker.

**Tech Stack:** Node 20, `pg`, `bcryptjs`, `jsonwebtoken`; testes com `node:test` e `pg-mem`; `sharp` (dev) só para gerar ícones.

**Spec:** `docs/superpowers/specs/2026-10-12-acertos-patroni-design.md` (copiar para o repositório novo na Task 1).

## Global Constraints

- Repositório e projeto Vercel separados do condo-app; nenhum serviço fora da Vercel.
- Valores em **centavos inteiros** (`valor_centavos`); percentuais em **pontos-base inteiros** (`bp`; 25% = 2500; a soma dos vigentes deve ser 10000).
- Datas como texto `YYYY-MM-DD` e mês como `YYYY-MM`; nunca usar `Date`/coluna `DATE` para vencimento (a Vercel roda em UTC e volta um dia).
- Perfis: `ADMIN` (escreve) e `SOCIO` (somente consulta). Toda rota de escrita exige ADMIN **no servidor**.
- Mês `FECHADO` é somente leitura, exceto o `status` do aporte (PENDENTE/PAGO).
- Interface em português do Brasil, formato monetário `1.234,56`, rótulos em sentença (sem Title Case).
- Valores de variáveis de ambiente só em ASCII (sem `ç`/acentos; um deploy do condo-app falhou por isso). Segredos nunca entram em código nem em commit.
- Rodar Node local contra o Neon exige `node --use-system-ca` (TLS interceptado nesta máquina).
- Aportes: `final = base + ajuste`; `base` é rateio por percentual do **valor a cobrir** = `max(0, débitos − créditos avulsos − saldo inicial)`, com restos distribuídos pelo método do maior resto.
- Último ADMIN ativo não pode ser excluído, inativado nem rebaixado.

## Estrutura de arquivos

```
acertos-patroni/
  package.json  vercel.json  .gitignore  README.md
  api/index.js                 adaptador Vercel -> lib/app.handle
  lib/db.js                    pool, query, tx
  lib/router.js                add(), handle(), ok(), fail()
  lib/auth.js                  cookie de sessão (JWT só com o id)
  lib/app.js                   carrega routes/* e exporta handle
  lib/datas.js                 proximoYm, moverParaMes
  lib/saldo.js                 saldoCorrido
  lib/abertura.js              proximosLancamentos
  lib/percentuais.js           vigentes, somaValida
  lib/aportes.js               valorACobrir, calcularAportes
  lib/validacao.js             lancamentoValido, ymValido
  lib/visao.js                 montarVisao (puro)
  lib/mesdb.js                 carregarVisao(ym) (lê o banco, chama visao)
  routes/auth.js usuarios.js socios.js meses.js lancamentos.js aportes.js
  migrations/001_init.sql
  scripts/migrate.js seed.js seed-outubro.js gen-icons.js
  public/index.html style.css manifest.webmanifest sw.js icons/
  public/js/money.mjs cobranca.mjs api.mjs ui.mjs app.mjs
  public/js/telas/login.mjs painel.mjs lancamentos.mjs lancamento-form.mjs aportes.mjs meses.mjs socios.mjs usuarios.mjs exportar.mjs
  test/*.test.js  test/helpers/app.js
```

---

### Task 1: Repositório, esqueleto e executor de testes

**Files:**
- Create: `package.json`, `.gitignore`, `vercel.json`, `README.md`, `docs/superpowers/specs/2026-10-12-acertos-patroni-design.md` (cópia), `test/smoke.test.js`

**Interfaces:**
- Produces: `npm test` roda `node --test test/`.

- [ ] **Step 1: Criar a pasta e o repositório**

```bash
mkdir -p "D:/1-Imóveis/acertos-patroni" && cd "D:/1-Imóveis/acertos-patroni"
git init -b main
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp "D:/1-Imóveis/Z-CondominioApp/condo-app/.claude/worktrees/pwa-financial-app-proposal-dbee6b/docs/superpowers/specs/2026-10-12-acertos-patroni-design.md" docs/superpowers/specs/
cp "D:/1-Imóveis/Z-CondominioApp/condo-app/.claude/worktrees/pwa-financial-app-proposal-dbee6b/docs/superpowers/plans/2026-10-12-acertos-patroni.md" docs/superpowers/plans/
```

- [ ] **Step 2: `package.json`**

```json
{
  "name": "acertos-patroni",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test test/",
    "migrate": "node --use-system-ca scripts/migrate.js",
    "seed": "node --use-system-ca scripts/seed.js",
    "icons": "node scripts/gen-icons.js",
    "dev": "vercel dev"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.11.5"
  },
  "devDependencies": {
    "pg-mem": "^3.0.2",
    "sharp": "^0.33.4"
  }
}
```

- [ ] **Step 3: `.gitignore`, `vercel.json`**

`.gitignore`:
```
node_modules
.env*
.vercel
```
`vercel.json`:
```json
{
  "rewrites": [{ "source": "/api/(.*)", "destination": "/api/index.js" }]
}
```

- [ ] **Step 4: Teste de fumaça, instalar e rodar**

`test/smoke.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
test('executor de testes funciona', () => assert.strictEqual(1 + 1, 2));
```
Run: `npm install && npm test`
Expected: `# pass 1`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: esqueleto do projeto e executor de testes"
```

---

### Task 2: Dinheiro e cobrança (módulos do front, testados em Node)

**Files:**
- Create: `public/js/money.mjs`, `public/js/cobranca.mjs`, `test/money.test.js`, `test/cobranca.test.js`

**Interfaces:**
- Produces: `parseBRL(texto) -> centavos|null`, `formatBRL(centavos) -> "1.234,56"`, `nomeDoMes("2026-10") -> "outubro/26"`, `textoCobranca(visao, ym) -> string`.

- [ ] **Step 1: Teste de dinheiro**

`test/money.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
test('parseBRL e formatBRL', async () => {
  const { parseBRL, formatBRL } = await import('../public/js/money.mjs');
  assert.strictEqual(parseBRL('1.555,21'), 155521);
  assert.strictEqual(parseBRL('16,23'), 1623);
  assert.strictEqual(parseBRL('-16,23'), -1623);
  assert.strictEqual(parseBRL('1555,21'), 155521);
  assert.strictEqual(parseBRL('1,5'), 150);
  assert.strictEqual(parseBRL('267'), 26700);
  assert.strictEqual(parseBRL('abc'), null);
  assert.strictEqual(parseBRL(''), null);
  assert.strictEqual(formatBRL(155521), '1.555,21');
  assert.strictEqual(formatBRL(-1623), '-16,23');
  assert.strictEqual(formatBRL(5), '0,05');
  assert.strictEqual(formatBRL(0), '0,00');
  assert.strictEqual(formatBRL(552373), '5.523,73');
});
```
- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/money.test.js` — Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `public/js/money.mjs`**

```js
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
```
- [ ] **Step 4: Rodar** `node --test test/money.test.js` — Expected: PASS.

- [ ] **Step 5: Teste de cobrança**

`test/cobranca.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
test('nomeDoMes', async () => {
  const { nomeDoMes } = await import('../public/js/cobranca.mjs');
  assert.strictEqual(nomeDoMes('2026-10'), 'outubro/26');
});
test('textoCobranca lista só pendentes', async () => {
  const { textoCobranca } = await import('../public/js/cobranca.mjs');
  const visao = { aportes: [
    { nome: 'Adriano', final_centavos: 145244, vencimento: '2026-10-15', status: 'PAGO' },
    { nome: 'Lígia', final_centavos: 115019, vencimento: '2026-10-15', status: 'PENDENTE' },
  ] };
  const t = textoCobranca(visao, '2026-10');
  assert.ok(t.includes('Lígia: R$ 1.150,19 (vence 15/10)'));
  assert.ok(!t.includes('Adriano'));
  assert.ok(t.startsWith('Aportes de outubro/26'));
});
test('textoCobranca sem pendências', async () => {
  const { textoCobranca } = await import('../public/js/cobranca.mjs');
  assert.strictEqual(textoCobranca({ aportes: [{ nome: 'A', final_centavos: 1, vencimento: '2026-10-15', status: 'PAGO' }] }, '2026-10'),
    'Aportes de outubro/26: todos recebidos.');
});
```
- [ ] **Step 6: Implementar `public/js/cobranca.mjs`**

```js
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
```
- [ ] **Step 7: Rodar** `npm test` — Expected: todos PASS. **Commit:** `git add -A && git commit -m "feat: dinheiro BRL e texto de cobrança"`

---

### Task 3: Datas e abertura de mês (puro)

**Files:**
- Create: `lib/datas.js`, `lib/abertura.js`, `test/datas.test.js`, `test/abertura.test.js`

**Interfaces:**
- Produces: `proximoYm(ym) -> ym`, `moverParaMes(dataIso, ym) -> dataIso` (mantém o dia; limita ao último dia do mês), `proximosLancamentos(anteriores, novoYm) -> lancamento[]` (campos: `tipo, descritivo, valor_centavos, vencimento, forma, status, recorrencia, parcela_atual, parcela_total`).

- [ ] **Step 1: Testes de datas**

`test/datas.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { proximoYm, moverParaMes } = require('../lib/datas');
test('proximoYm', () => {
  assert.strictEqual(proximoYm('2026-10'), '2026-11');
  assert.strictEqual(proximoYm('2026-12'), '2027-01');
});
test('moverParaMes mantém o dia e limita ao fim do mês', () => {
  assert.strictEqual(moverParaMes('2026-10-15', '2026-11'), '2026-11-15');
  assert.strictEqual(moverParaMes('2026-10-31', '2026-11'), '2026-11-30');
  assert.strictEqual(moverParaMes('2026-12-31', '2027-02'), '2027-02-28');
  assert.strictEqual(moverParaMes('2027-12-31', '2028-02'), '2028-02-29');
});
```
- [ ] **Step 2: Rodar (FAIL)**, **Step 3: Implementar `lib/datas.js`**

```js
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
```
- [ ] **Step 4: Rodar (PASS)**; **Step 5: Testes de abertura**

`test/abertura.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { proximosLancamentos } = require('../lib/abertura');

const base = (o) => ({ tipo: 'DEBITO', descritivo: 'X', valor_centavos: 100, vencimento: '2026-10-25', forma: 'GUIA',
  status: 'PAGO', recorrencia: 'NENHUMA', parcela_atual: null, parcela_total: null, ...o });

test('copia FIXO sem mudar parcela e reabre como a pagar', () => {
  const r = proximosLancamentos([base({ descritivo: 'Contabilidade', recorrencia: 'FIXO', vencimento: '2026-10-15' })], '2026-11');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].vencimento, '2026-11-15');
  assert.strictEqual(r[0].status, 'A_PAGAR');
  assert.strictEqual(r[0].parcela_atual, null);
});
test('PARCELADO avança a parcela', () => {
  const r = proximosLancamentos([base({ descritivo: 'ICMS', recorrencia: 'PARCELADO', parcela_atual: 17, parcela_total: 119, valor_centavos: 155521 })], '2026-11');
  assert.strictEqual(r[0].parcela_atual, 18);
  assert.strictEqual(r[0].parcela_total, 119);
  assert.strictEqual(r[0].valor_centavos, 155521);
});
test('PARCELADO na última parcela some', () => {
  assert.strictEqual(proximosLancamentos([base({ recorrencia: 'PARCELADO', parcela_atual: 58, parcela_total: 58 })], '2026-11').length, 0);
});
test('NENHUMA não é copiado', () => {
  assert.strictEqual(proximosLancamentos([base({})], '2026-11').length, 0);
});
test('crédito fixo reabre como a receber', () => {
  const r = proximosLancamentos([base({ tipo: 'CREDITO', recorrencia: 'FIXO', status: 'RECEBIDO' })], '2026-11');
  assert.strictEqual(r[0].status, 'A_RECEBER');
});
```
- [ ] **Step 6: Implementar `lib/abertura.js`**

```js
const { moverParaMes } = require('./datas');

function proximosLancamentos(anteriores, novoYm) {
  const saida = [];
  for (const l of anteriores) {
    if (l.recorrencia === 'NENHUMA') continue;
    let atual = l.parcela_atual;
    if (l.recorrencia === 'PARCELADO') {
      if (atual >= l.parcela_total) continue;
      atual += 1;
    }
    saida.push({
      tipo: l.tipo,
      descritivo: l.descritivo,
      valor_centavos: l.valor_centavos,
      vencimento: moverParaMes(l.vencimento, novoYm),
      forma: l.forma,
      status: l.tipo === 'DEBITO' ? 'A_PAGAR' : 'A_RECEBER',
      recorrencia: l.recorrencia,
      parcela_atual: atual,
      parcela_total: l.parcela_total,
    });
  }
  return saida;
}

module.exports = { proximosLancamentos };
```
- [ ] **Step 7:** `npm test` PASS. **Commit:** `git add -A && git commit -m "feat: datas e abertura de mês"`

---

### Task 4: Saldo corrido, percentuais e aportes (puro)

**Files:**
- Create: `lib/saldo.js`, `lib/percentuais.js`, `lib/aportes.js`, `test/saldo.test.js`, `test/percentuais.test.js`, `test/aportes.test.js`

**Interfaces:**
- Produces:
  - `saldoCorrido(saldoInicial, linhas[{tipo,valor_centavos}]) -> number[]` (um saldo por linha; DEBITO subtrai, CREDITO soma).
  - `vigentes(historico[{socio_id,vigente_desde,bp}], ym) -> [{socio_id,bp}]` (último `vigente_desde <= ym` por sócio; descarta `bp` 0; ordenado por `socio_id`).
  - `somaValida(itens[{bp}]) -> boolean` (soma === 10000).
  - `valorACobrir({debitos, creditosAvulsos, saldoInicial}) -> number` (`max(0, debitos - creditosAvulsos - saldoInicial)`).
  - `calcularAportes({aCobrir, itens[{socio_id,bp}], ajustes{[socio_id]:centavos}}) -> [{socio_id,bp,base_centavos,ajuste_centavos,final_centavos}]`.

- [ ] **Step 1: Testes**

`test/saldo.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { saldoCorrido } = require('../lib/saldo');
test('saldo corrido de outubro/26 (planilha)', () => {
  const s = saldoCorrido(-1623, [
    { tipo: 'DEBITO', valor_centavos: 26700 },
    { tipo: 'DEBITO', valor_centavos: 338304 },
    { tipo: 'DEBITO', valor_centavos: 155521 },
    { tipo: 'DEBITO', valor_centavos: 30225 },
    { tipo: 'CREDITO', valor_centavos: 145244 },
  ]);
  assert.deepStrictEqual(s, [-28323, -366627, -522148, -552373, -407129]);
});
```
`test/percentuais.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { vigentes, somaValida } = require('../lib/percentuais');
const h = [
  { socio_id: 1, vigente_desde: '2026-01', bp: 2500 },
  { socio_id: 2, vigente_desde: '2026-01', bp: 3000 },
  { socio_id: 3, vigente_desde: '2026-01', bp: 2500 },
  { socio_id: 4, vigente_desde: '2026-01', bp: 2000 },
  { socio_id: 2, vigente_desde: '2026-12', bp: 3500 },
  { socio_id: 4, vigente_desde: '2026-12', bp: 1500 },
];
test('vigentes escolhe a última vigência até o mês', () => {
  assert.deepStrictEqual(vigentes(h, '2026-10').map((x) => x.bp), [2500, 3000, 2500, 2000]);
  assert.deepStrictEqual(vigentes(h, '2026-12').map((x) => x.bp), [2500, 3500, 2500, 1500]);
});
test('vigentes descarta bp 0 (sócio que saiu)', () => {
  const r = vigentes([...h, { socio_id: 4, vigente_desde: '2027-01', bp: 0 }, { socio_id: 1, vigente_desde: '2027-01', bp: 4000 }], '2027-01');
  assert.strictEqual(r.find((x) => x.socio_id === 4), undefined);
});
test('somaValida', () => {
  assert.ok(somaValida([{ bp: 2500 }, { bp: 3000 }, { bp: 2500 }, { bp: 2000 }]));
  assert.ok(!somaValida([{ bp: 2500 }, { bp: 3000 }]));
});
```
`test/aportes.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { valorACobrir, calcularAportes } = require('../lib/aportes');
const itens = [{ socio_id: 1, bp: 2500 }, { socio_id: 2, bp: 3000 }, { socio_id: 3, bp: 2500 }, { socio_id: 4, bp: 2000 }];

test('valor a cobrir de outubro/26', () => {
  assert.strictEqual(valorACobrir({ debitos: 550750, creditosAvulsos: 0, saldoInicial: -1623 }), 552373);
});
test('saldo inicial positivo abate; nunca negativo', () => {
  assert.strictEqual(valorACobrir({ debitos: 1000, creditosAvulsos: 0, saldoInicial: 400 }), 600);
  assert.strictEqual(valorACobrir({ debitos: 1000, creditosAvulsos: 0, saldoInicial: 5000 }), 0);
});
test('rateio soma exatamente o valor a cobrir (maior resto)', () => {
  const r = calcularAportes({ aCobrir: 552373, itens, ajustes: {} });
  assert.deepStrictEqual(r.map((x) => x.base_centavos), [138093, 165712, 138093, 110475]);
  assert.strictEqual(r.reduce((s, x) => s + x.base_centavos, 0), 552373);
  assert.deepStrictEqual(r.map((x) => x.final_centavos), [138093, 165712, 138093, 110475]);
});
test('ajuste entra no final, não na base', () => {
  const r = calcularAportes({ aCobrir: 552373, itens, ajustes: { 3: -30225, 2: 1622 } });
  assert.strictEqual(r[2].base_centavos, 138093);
  assert.strictEqual(r[2].ajuste_centavos, -30225);
  assert.strictEqual(r[2].final_centavos, 107868);
  assert.strictEqual(r[1].final_centavos, 167334);
});
test('aCobrir zero devolve zeros', () => {
  assert.deepStrictEqual(calcularAportes({ aCobrir: 0, itens, ajustes: {} }).map((x) => x.final_centavos), [0, 0, 0, 0]);
});
```
- [ ] **Step 2: Rodar (FAIL)**; **Step 3: Implementar**

`lib/saldo.js`:
```js
function saldoCorrido(saldoInicial, linhas) {
  let s = saldoInicial;
  return linhas.map((l) => {
    s += l.tipo === 'CREDITO' ? l.valor_centavos : -l.valor_centavos;
    return s;
  });
}
module.exports = { saldoCorrido };
```
`lib/percentuais.js`:
```js
function vigentes(historico, ym) {
  const por = new Map();
  for (const r of historico) {
    if (r.vigente_desde > ym) continue;
    const atual = por.get(r.socio_id);
    if (!atual || r.vigente_desde > atual.vigente_desde) por.set(r.socio_id, r);
  }
  return [...por.values()]
    .filter((r) => r.bp > 0)
    .map((r) => ({ socio_id: r.socio_id, bp: r.bp }))
    .sort((a, b) => a.socio_id - b.socio_id);
}

function somaValida(itens) {
  return itens.reduce((s, i) => s + i.bp, 0) === 10000;
}

module.exports = { vigentes, somaValida };
```
`lib/aportes.js`:
```js
function valorACobrir({ debitos, creditosAvulsos, saldoInicial }) {
  return Math.max(0, debitos - creditosAvulsos - saldoInicial);
}

function calcularAportes({ aCobrir, itens, ajustes }) {
  const linhas = itens.map((it, idx) => {
    const bruto = aCobrir * it.bp;
    return { idx, socio_id: it.socio_id, bp: it.bp, base: Math.floor(bruto / 10000), resto: bruto % 10000 };
  });
  let faltam = aCobrir - linhas.reduce((s, l) => s + l.base, 0);
  [...linhas].sort((a, b) => b.resto - a.resto || a.idx - b.idx).forEach((l) => {
    if (faltam > 0) { l.base += 1; faltam -= 1; }
  });
  return linhas.map((l) => {
    const ajuste = ajustes[l.socio_id] || 0;
    return { socio_id: l.socio_id, bp: l.bp, base_centavos: l.base, ajuste_centavos: ajuste, final_centavos: l.base + ajuste };
  });
}

module.exports = { valorACobrir, calcularAportes };
```
- [ ] **Step 4:** `npm test` PASS. **Commit:** `git add -A && git commit -m "feat: saldo corrido, percentuais vigentes e rateio de aportes"`

---

### Task 5: Visão do mês (puro)

**Files:**
- Create: `lib/visao.js`, `test/visao.test.js`

**Interfaces:**
- Consumes: `saldoCorrido`, `vigentes`, `valorACobrir`, `calcularAportes`.
- Produces: `montarVisao({mes, lancamentos, socios, historico, aportes}) -> { ym, status, provisorio, saldo_inicial_centavos, lancamentos[+saldo_centavos], aportes[{socio_id,nome,bp,base_centavos,ajuste_centavos,ajuste_motivo,ajuste_origem,final_centavos,status,vencimento,saldo_centavos}], totais{debitos,creditos_avulsos,a_cobrir,aportes,diferenca,saldo_final} }`.
  - `mes = {ym,status,saldo_inicial_centavos}`; `socios = [{id,nome}]`; `historico = [{socio_id,vigente_desde,bp}]`; `aportes` = linhas da tabela `aporte` (`socio_id,bp,base_centavos,ajuste_centavos,ajuste_motivo,ajuste_origem,final_centavos,status,vencimento`).
  - Mês ABERTO: aportes calculados na hora (`provisorio: true`, vencimento `${ym}-15`, ajustes vêm das linhas de `aportes`). Mês FECHADO: aportes lidos congelados das linhas com `final_centavos` não nulo.
  - Lançamentos ordenados por `vencimento`, depois `ordem`, depois `id`.

- [ ] **Step 1: Teste (outubro/26 completo)**

`test/visao.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { montarVisao } = require('../lib/visao');

const socios = [{ id: 1, nome: 'Adriano' }, { id: 2, nome: 'Henrique' }, { id: 3, nome: 'Lígia' }, { id: 4, nome: 'Luiz' }];
const historico = [[1, 2500], [2, 3000], [3, 2500], [4, 2000]].map(([s, bp]) => ({ socio_id: s, vigente_desde: '2026-10', bp }));
const L = (id, descritivo, valor, venc) => ({ id, tipo: 'DEBITO', descritivo, valor_centavos: valor, vencimento: venc, ordem: id, status: 'A_PAGAR', forma: 'BOLETO' });
const lancamentos = [
  L(3, 'ICMS', 155521, '2026-10-25'), L(1, 'Contabilidade', 26700, '2026-10-15'),
  L(2, 'Condominio', 338304, '2026-10-20'), L(4, 'DASN', 30225, '2026-10-25'),
];
const mes = { ym: '2026-10', status: 'ABERTO', saldo_inicial_centavos: -1623 };

test('outubro/26 aberto: ordem, totais e saldo final zero', () => {
  const v = montarVisao({ mes, lancamentos, socios, historico, aportes: [] });
  assert.deepStrictEqual(v.lancamentos.map((l) => l.descritivo), ['Contabilidade', 'Condominio', 'ICMS', 'DASN']);
  assert.deepStrictEqual(v.lancamentos.map((l) => l.saldo_centavos), [-28323, -366627, -522148, -552373]);
  assert.strictEqual(v.totais.debitos, 550750);
  assert.strictEqual(v.totais.a_cobrir, 552373);
  assert.strictEqual(v.totais.aportes, 552373);
  assert.strictEqual(v.totais.diferenca, 0);
  assert.strictEqual(v.totais.saldo_final, 0);
  assert.strictEqual(v.provisorio, true);
  assert.strictEqual(v.aportes[0].nome, 'Adriano');
  assert.strictEqual(v.aportes[0].vencimento, '2026-10-15');
});

test('ajuste aberto aparece e gera diferença', () => {
  const aportes = [{ socio_id: 3, ajuste_centavos: -30225, ajuste_motivo: 'acerto set', ajuste_origem: '2026-09', status: 'PENDENTE' }];
  const v = montarVisao({ mes, lancamentos, socios, historico, aportes });
  assert.strictEqual(v.aportes[2].final_centavos, 107868);
  assert.strictEqual(v.aportes[2].ajuste_motivo, 'acerto set');
  assert.strictEqual(v.totais.diferenca, -30225);
});

test('mês fechado usa aportes congelados', () => {
  const aportes = [{ socio_id: 1, bp: 2500, base_centavos: 100, ajuste_centavos: 0, final_centavos: 100, status: 'PAGO', vencimento: '2026-10-15', ajuste_motivo: null, ajuste_origem: null }];
  const v = montarVisao({ mes: { ...mes, status: 'FECHADO' }, lancamentos, socios, historico, aportes });
  assert.strictEqual(v.provisorio, false);
  assert.strictEqual(v.aportes.length, 1);
  assert.strictEqual(v.aportes[0].status, 'PAGO');
  assert.strictEqual(v.aportes[0].nome, 'Adriano');
});
```
- [ ] **Step 2: Rodar (FAIL)**; **Step 3: Implementar `lib/visao.js`**

```js
const { saldoCorrido } = require('./saldo');
const { vigentes } = require('./percentuais');
const { valorACobrir, calcularAportes } = require('./aportes');

function montarVisao({ mes, lancamentos, socios, historico, aportes }) {
  const ordenados = [...lancamentos].sort(
    (a, b) => a.vencimento.localeCompare(b.vencimento) || a.ordem - b.ordem || a.id - b.id);
  const soma = (t) => ordenados.filter((l) => l.tipo === t).reduce((s, l) => s + l.valor_centavos, 0);
  const debitos = soma('DEBITO');
  const creditosAvulsos = soma('CREDITO');
  const aCobrir = valorACobrir({ debitos, creditosAvulsos, saldoInicial: mes.saldo_inicial_centavos });
  const nome = (id) => (socios.find((s) => s.id === id) || {}).nome || '';
  const fechado = mes.status === 'FECHADO';

  let linhas;
  if (fechado) {
    linhas = aportes.filter((a) => a.final_centavos !== null && a.final_centavos !== undefined).map((a) => ({ ...a }));
  } else {
    const porSocio = new Map(aportes.map((a) => [a.socio_id, a]));
    const ajustes = {};
    aportes.forEach((a) => { ajustes[a.socio_id] = a.ajuste_centavos || 0; });
    linhas = calcularAportes({ aCobrir, itens: vigentes(historico, mes.ym), ajustes }).map((c) => {
      const a = porSocio.get(c.socio_id) || {};
      return { ...c, ajuste_motivo: a.ajuste_motivo || null, ajuste_origem: a.ajuste_origem || null,
        status: a.status || 'PENDENTE', vencimento: `${mes.ym}-15` };
    });
  }
  linhas = linhas.map((a) => ({ ...a, nome: nome(a.socio_id) })).sort((a, b) => a.socio_id - b.socio_id);

  const corridas = [...ordenados, ...linhas.map((a) => ({ tipo: 'CREDITO', valor_centavos: a.final_centavos }))];
  const saldos = saldoCorrido(mes.saldo_inicial_centavos, corridas);
  const totalAportes = linhas.reduce((s, a) => s + a.final_centavos, 0);

  return {
    ym: mes.ym,
    status: mes.status,
    provisorio: !fechado,
    saldo_inicial_centavos: mes.saldo_inicial_centavos,
    lancamentos: ordenados.map((l, i) => ({ ...l, saldo_centavos: saldos[i] })),
    aportes: linhas.map((a, i) => ({ ...a, saldo_centavos: saldos[ordenados.length + i] })),
    totais: {
      debitos, creditos_avulsos: creditosAvulsos, a_cobrir: aCobrir, aportes: totalAportes,
      diferenca: totalAportes - aCobrir,
      saldo_final: saldos.length ? saldos[saldos.length - 1] : mes.saldo_inicial_centavos,
    },
  };
}

module.exports = { montarVisao };
```
- [ ] **Step 4:** `npm test` PASS. **Commit:** `git add -A && git commit -m "feat: visão do mês (saldo, aportes provisórios e congelados)"`

---

### Task 6: Banco, migração e infraestrutura de teste de API

**Files:**
- Create: `migrations/001_init.sql`, `lib/db.js`, `lib/router.js`, `lib/auth.js`, `lib/app.js`, `api/index.js`, `scripts/migrate.js`, `test/helpers/app.js`, `test/router.test.js`

**Interfaces:**
- Produces:
  - `db.setPool(pool)`, `db.query(sql, params) -> rows[]`, `db.tx(async (q) => ...)` onde `q(sql, params) -> rows[]` roda na transação.
  - `router.add(method, path, {role: 'PUBLIC'|'AUTH'|'ADMIN'}, async ({params, body, user, headers}) => ({status, json, headers?}))`, `router.handle({method, path, headers, body}) -> {status, json, headers?}`, `router.ok(json, status=200)`, `router.fail(status, mensagem)` (lança).
  - `auth.cookieFor(userId) -> string`, `auth.clearCookie() -> string`, `auth.userIdFrom(headers) -> number|null`.
  - Helper de teste: `const { criarApp } = require('./helpers/app')` → `{ call(method, path, body, cookie) -> {status, json, headers}, criarUsuario({nome,email,senha,perfil}) -> id, login(email, senha) -> cookie, query }`.

- [ ] **Step 1: `migrations/001_init.sql`**

```sql
CREATE TABLE usuario (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('ADMIN','SOCIO')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE socio (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuario(id),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE socio_percentual (
  socio_id INTEGER NOT NULL REFERENCES socio(id),
  vigente_desde TEXT NOT NULL,
  bp INTEGER NOT NULL CHECK (bp >= 0 AND bp <= 10000),
  PRIMARY KEY (socio_id, vigente_desde)
);
CREATE TABLE mes (
  ym TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO','FECHADO')),
  saldo_inicial_centavos INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE lancamento (
  id SERIAL PRIMARY KEY,
  ym TEXT NOT NULL REFERENCES mes(ym),
  tipo TEXT NOT NULL CHECK (tipo IN ('DEBITO','CREDITO')),
  descritivo TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  vencimento TEXT NOT NULL,
  forma TEXT NOT NULL CHECK (forma IN ('BOLETO','GUIA','PIX','OUTRO')),
  status TEXT NOT NULL CHECK (status IN ('A_PAGAR','PAGO','A_RECEBER','RECEBIDO')),
  ordem INTEGER NOT NULL DEFAULT 0,
  recorrencia TEXT NOT NULL DEFAULT 'NENHUMA' CHECK (recorrencia IN ('NENHUMA','FIXO','PARCELADO')),
  parcela_atual INTEGER,
  parcela_total INTEGER
);
CREATE TABLE aporte (
  ym TEXT NOT NULL REFERENCES mes(ym),
  socio_id INTEGER NOT NULL REFERENCES socio(id),
  bp INTEGER,
  base_centavos INTEGER,
  ajuste_centavos INTEGER NOT NULL DEFAULT 0,
  ajuste_motivo TEXT,
  ajuste_origem TEXT,
  final_centavos INTEGER,
  vencimento TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','PAGO')),
  PRIMARY KEY (ym, socio_id)
);
```

- [ ] **Step 2: `lib/db.js`**

```js
const { Pool } = require('pg');
let pool = null;

function setPool(p) { pool = p; }
function getPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

async function query(sql, params = []) {
  return (await getPool().query(sql, params)).rows;
}

async function tx(fn) {
  const c = await getPool().connect();
  try {
    await c.query('BEGIN');
    const r = await fn(async (sql, params = []) => (await c.query(sql, params)).rows);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

module.exports = { setPool, query, tx };
```

- [ ] **Step 3: `lib/auth.js`**

```js
const jwt = require('jsonwebtoken');
const MAX_AGE = 7 * 24 * 3600;
const secret = () => process.env.SESSION_SECRET;

function cookieFor(userId) {
  const token = jwt.sign({ id: userId }, secret(), { expiresIn: MAX_AGE });
  return `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}
const clearCookie = () => 'sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

function userIdFrom(headers) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec((headers && headers.cookie) || '');
  if (!m) return null;
  try { return jwt.verify(m[1], secret()).id; } catch { return null; }
}

module.exports = { cookieFor, clearCookie, userIdFrom };
```

- [ ] **Step 4: `lib/router.js`**

```js
const { query } = require('./db');
const { userIdFrom } = require('./auth');
const routes = [];

function add(method, path, opts, fn) {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, role: opts.role, fn });
}

const ok = (json, status = 200) => ({ status, json });
function fail(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  throw e;
}

async function handle({ method, path, headers = {}, body }) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    try {
      let user = null;
      if (r.role !== 'PUBLIC') {
        const id = userIdFrom(headers);
        const [u] = id ? await query('SELECT id, nome, perfil, ativo FROM usuario WHERE id = $1', [id]) : [];
        if (!u || !u.ativo) return { status: 401, json: { erro: 'Faça login para continuar.' } };
        user = { id: u.id, nome: u.nome, perfil: u.perfil };
        if (r.role === 'ADMIN' && u.perfil !== 'ADMIN') return { status: 403, json: { erro: 'Somente o administrador pode fazer isso.' } };
      }
      return await r.fn({ params, body: body || {}, user, headers });
    } catch (e) {
      if (e.status) return { status: e.status, json: { erro: e.message } };
      console.error(e);
      return { status: 500, json: { erro: 'Erro interno. Tente de novo.' } };
    }
  }
  return { status: 404, json: { erro: 'Rota não encontrada.' } };
}

module.exports = { add, handle, ok, fail };
```

- [ ] **Step 5: `lib/app.js` e `api/index.js`**

`lib/app.js` (os `require` de rotas ficam comentados até cada task criá-las — **cada task de rota adiciona sua linha aqui**):
```js
require('../routes/auth');
module.exports = require('./router');
```
`api/index.js`:
```js
const { handle } = require('../lib/app');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const r = await handle({ method: req.method, path: url.pathname, headers: req.headers, body: req.body });
  Object.entries(r.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.status(r.status).json(r.json);
};
```
Para `lib/app.js` compilar já nesta task, crie `routes/auth.js` vazio por ora: `module.exports = {};` (a Task 7 o preenche).

- [ ] **Step 6: `test/helpers/app.js`**

```js
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');
const db = require('../../lib/db');

process.env.SESSION_SECRET = 'segredo-de-teste';

async function criarApp() {
  const mem = newDb();
  mem.public.none(fs.readFileSync(path.join(__dirname, '../../migrations/001_init.sql'), 'utf8'));
  const { Pool } = mem.adapters.createPg();
  db.setPool(new Pool());
  const { handle } = require('../../lib/app');

  const call = (method, p, body, cookie) => handle({ method, path: p, body, headers: cookie ? { cookie } : {} });
  async function criarUsuario({ nome = 'Teste', email, senha = 'senha-de-teste', perfil = 'ADMIN' }) {
    const [u] = await db.query(
      'INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES ($1,$2,$3,$4) RETURNING id',
      [nome, email, bcrypt.hashSync(senha, 4), perfil]);
    return u.id;
  }
  async function login(email, senha = 'senha-de-teste') {
    const r = await call('POST', '/api/login', { email, senha });
    return r.headers['Set-Cookie'].split(';')[0];
  }
  return { call, criarUsuario, login, query: db.query };
}

module.exports = { criarApp };
```

- [ ] **Step 7: Teste do roteador**

`test/router.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');
const { add, ok } = require('../lib/router');

add('GET', '/api/_t/publico', { role: 'PUBLIC' }, async () => ok({ a: 1 }));
add('GET', '/api/_t/auth', { role: 'AUTH' }, async ({ user }) => ok({ perfil: user.perfil }));
add('POST', '/api/_t/admin', { role: 'ADMIN' }, async () => ok({ feito: true }));

test('401 sem login, 403 para SOCIO, 200 para ADMIN, 404 desconhecida', async () => {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  await app.criarUsuario({ email: 's@x.com', perfil: 'SOCIO' });
  assert.strictEqual((await app.call('GET', '/api/_t/publico')).status, 200);
  assert.strictEqual((await app.call('GET', '/api/_t/auth')).status, 401);
  const cs = await app.login('s@x.com');
  const ca = await app.login('a@x.com');
  assert.strictEqual((await app.call('GET', '/api/_t/auth', null, cs)).json.perfil, 'SOCIO');
  assert.strictEqual((await app.call('POST', '/api/_t/admin', {}, cs)).status, 403);
  assert.strictEqual((await app.call('POST', '/api/_t/admin', {}, ca)).status, 200);
  assert.strictEqual((await app.call('GET', '/api/_t/nada')).status, 404);
});
```
Este teste depende do login (Task 7). **Não rodar ainda**; ele passa ao fim da Task 7.

- [ ] **Step 8: `scripts/migrate.js`**

```js
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('CREATE TABLE IF NOT EXISTS _migracao (nome TEXT PRIMARY KEY)');
  const dir = path.join(__dirname, '../migrations');
  for (const f of fs.readdirSync(dir).sort()) {
    const { rows } = await pool.query('SELECT 1 FROM _migracao WHERE nome = $1', [f]);
    if (rows.length) continue;
    await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    await pool.query('INSERT INTO _migracao (nome) VALUES ($1)', [f]);
    console.log('aplicada', f);
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
```
- [ ] **Step 9: Commit** `git add -A && git commit -m "feat: schema, banco, roteador, auth e helper de teste"`

---

### Task 7: Login, logout e sessão

**Files:**
- Modify: `routes/auth.js`
- Test: `test/auth.test.js`

**Interfaces:**
- Produces: `POST /api/login {email,senha} -> {id,nome,perfil}` + `Set-Cookie`; `POST /api/logout`; `GET /api/me -> {id,nome,perfil}`.

- [ ] **Step 1: Teste**

`test/auth.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

test('login correto, errado, inativo e /me', async () => {
  const app = await criarApp();
  const id = await app.criarUsuario({ nome: 'Gilmar', email: 'g@x.com', perfil: 'ADMIN' });
  const ruim = await app.call('POST', '/api/login', { email: 'g@x.com', senha: 'errada' });
  assert.strictEqual(ruim.status, 401);
  const bom = await app.call('POST', '/api/login', { email: 'G@x.com', senha: 'senha-de-teste' });
  assert.strictEqual(bom.status, 200);
  assert.strictEqual(bom.json.perfil, 'ADMIN');
  assert.ok(bom.headers['Set-Cookie'].includes('HttpOnly'));
  const cookie = bom.headers['Set-Cookie'].split(';')[0];
  assert.strictEqual((await app.call('GET', '/api/me', null, cookie)).json.nome, 'Gilmar');
  await app.query('UPDATE usuario SET ativo = false WHERE id = $1', [id]);
  assert.strictEqual((await app.call('GET', '/api/me', null, cookie)).status, 401);
  assert.strictEqual((await app.call('POST', '/api/login', { email: 'g@x.com', senha: 'senha-de-teste' })).status, 401);
});
```
- [ ] **Step 2: Rodar `node --test test/auth.test.js` (FAIL).** **Step 3: Implementar `routes/auth.js`**

```js
const bcrypt = require('bcryptjs');
const { add, ok, fail } = require('../lib/router');
const { query } = require('../lib/db');
const { cookieFor, clearCookie } = require('../lib/auth');

add('POST', '/api/login', { role: 'PUBLIC' }, async ({ body }) => {
  const [u] = await query('SELECT * FROM usuario WHERE lower(email) = lower($1) AND ativo', [String(body.email || '')]);
  if (!u || !(await bcrypt.compare(String(body.senha || ''), u.senha_hash))) fail(401, 'E-mail ou senha incorretos.');
  return { status: 200, json: { id: u.id, nome: u.nome, perfil: u.perfil }, headers: { 'Set-Cookie': cookieFor(u.id) } };
});

add('POST', '/api/logout', { role: 'PUBLIC' }, async () => (
  { status: 200, json: { ok: true }, headers: { 'Set-Cookie': clearCookie() } }));

add('GET', '/api/me', { role: 'AUTH' }, async ({ user }) => ok(user));
```
- [ ] **Step 4:** `npm test` (inclui `router.test.js`) — Expected: PASS. **Commit:** `git add -A && git commit -m "feat: login, logout e sessão"`

---

### Task 8: Usuários (cadastrar, editar, excluir)

**Files:**
- Create: `routes/usuarios.js`; Modify: `lib/app.js` (adicionar `require('../routes/usuarios');`)
- Test: `test/usuarios.test.js`

**Interfaces:**
- Produces (ADMIN): `GET /api/usuarios -> [{id,nome,email,perfil,ativo}]`; `POST /api/usuarios {nome,email,senha,perfil} -> 201 {id}`; `PUT /api/usuarios/:id {nome?,email?,perfil?,ativo?,senha?}`; `DELETE /api/usuarios/:id -> {excluido:true}` ou `{inativado:true}` se o usuário está ligado a um sócio.
- Regras: senha ≥ 8 caracteres; e-mail com `@`; perfil ∈ {ADMIN, SOCIO}; e-mail único (409); último ADMIN ativo protegido (409).

- [ ] **Step 1: Teste**

`test/usuarios.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

async function cenario() {
  const app = await criarApp();
  const adminId = await app.criarUsuario({ nome: 'Adm', email: 'a@x.com', perfil: 'ADMIN' });
  await app.criarUsuario({ nome: 'Soc', email: 's@x.com', perfil: 'SOCIO' });
  return { app, adminId, ca: await app.login('a@x.com'), cs: await app.login('s@x.com') };
}

test('SOCIO não acessa usuários', async () => {
  const { app, cs } = await cenario();
  assert.strictEqual((await app.call('GET', '/api/usuarios', null, cs)).status, 403);
});
test('cria, valida e edita', async () => {
  const { app, ca } = await cenario();
  assert.strictEqual((await app.call('POST', '/api/usuarios', { nome: 'N', email: 'n@x.com', senha: 'curta', perfil: 'SOCIO' }, ca)).status, 400);
  const r = await app.call('POST', '/api/usuarios', { nome: 'N', email: 'n@x.com', senha: 'senha-longa-1', perfil: 'SOCIO' }, ca);
  assert.strictEqual(r.status, 201);
  assert.strictEqual((await app.call('POST', '/api/usuarios', { nome: 'N2', email: 'N@x.com', senha: 'senha-longa-1', perfil: 'SOCIO' }, ca)).status, 409);
  assert.strictEqual((await app.call('PUT', `/api/usuarios/${r.json.id}`, { nome: 'Novo Nome' }, ca)).status, 200);
  const lista = await app.call('GET', '/api/usuarios', null, ca);
  assert.ok(lista.json.find((u) => u.nome === 'Novo Nome'));
  assert.strictEqual(lista.json[0].senha_hash, undefined);
});
test('último ADMIN não pode ser excluído, inativado nem rebaixado', async () => {
  const { app, adminId, ca } = await cenario();
  assert.strictEqual((await app.call('DELETE', `/api/usuarios/${adminId}`, null, ca)).status, 409);
  assert.strictEqual((await app.call('PUT', `/api/usuarios/${adminId}`, { ativo: false }, ca)).status, 409);
  assert.strictEqual((await app.call('PUT', `/api/usuarios/${adminId}`, { perfil: 'SOCIO' }, ca)).status, 409);
});
test('excluir usuário ligado a sócio apenas inativa', async () => {
  const { app, ca } = await cenario();
  const u = await app.call('POST', '/api/usuarios', { nome: 'V', email: 'v@x.com', senha: 'senha-longa-1', perfil: 'SOCIO' }, ca);
  await app.query("INSERT INTO socio (usuario_id, nome) VALUES ($1, 'V')", [u.json.id]);
  const d = await app.call('DELETE', `/api/usuarios/${u.json.id}`, null, ca);
  assert.deepStrictEqual(d.json, { inativado: true });
  const [row] = await app.query('SELECT ativo FROM usuario WHERE id = $1', [u.json.id]);
  assert.strictEqual(row.ativo, false);
});
test('exclui de verdade quando sem vínculo', async () => {
  const { app, ca } = await cenario();
  const u = await app.call('POST', '/api/usuarios', { nome: 'W', email: 'w@x.com', senha: 'senha-longa-1', perfil: 'SOCIO' }, ca);
  assert.deepStrictEqual((await app.call('DELETE', `/api/usuarios/${u.json.id}`, null, ca)).json, { excluido: true });
});
```
- [ ] **Step 2: Rodar (FAIL)**; **Step 3: Implementar `routes/usuarios.js`**

```js
const bcrypt = require('bcryptjs');
const { add, ok, fail } = require('../lib/router');
const { query } = require('../lib/db');

const PERFIS = ['ADMIN', 'SOCIO'];

function validar(b, { criando }) {
  if (criando || b.nome !== undefined) if (!String(b.nome || '').trim()) fail(400, 'Informe o nome.');
  if (criando || b.email !== undefined) if (!/^\S+@\S+$/.test(String(b.email || ''))) fail(400, 'Informe um e-mail válido.');
  if (criando || b.perfil !== undefined) if (!PERFIS.includes(b.perfil)) fail(400, 'Perfil inválido.');
  if (criando || b.senha !== undefined) if (String(b.senha || '').length < 8) fail(400, 'A senha precisa ter ao menos 8 caracteres.');
}

async function outrosAdminsAtivos(id) {
  const [r] = await query("SELECT count(*)::int AS n FROM usuario WHERE perfil = 'ADMIN' AND ativo AND id <> $1", [id]);
  return r.n;
}

async function protegerUltimoAdmin(id, alvoDepois) {
  const [u] = await query('SELECT perfil, ativo FROM usuario WHERE id = $1', [id]);
  if (!u) fail(404, 'Usuário não encontrado.');
  const eraAdminAtivo = u.perfil === 'ADMIN' && u.ativo;
  const seraAdminAtivo = alvoDepois.perfil === 'ADMIN' && alvoDepois.ativo;
  if (eraAdminAtivo && !seraAdminAtivo && (await outrosAdminsAtivos(id)) === 0) {
    fail(409, 'Este é o único administrador ativo. Cadastre outro antes.');
  }
}

async function gravar(sql, params) {
  try { return await query(sql, params); } catch (e) {
    if (/unique|duplicate/i.test(e.message)) fail(409, 'Já existe um usuário com esse e-mail.');
    throw e;
  }
}

add('GET', '/api/usuarios', { role: 'ADMIN' }, async () =>
  ok(await query('SELECT id, nome, email, perfil, ativo FROM usuario ORDER BY nome')));

add('POST', '/api/usuarios', { role: 'ADMIN' }, async ({ body }) => {
  validar(body, { criando: true });
  const [u] = await gravar(
    'INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, $4) RETURNING id',
    [body.nome.trim(), body.email.trim(), bcrypt.hashSync(body.senha, 10), body.perfil]);
  return ok({ id: u.id }, 201);
});

add('PUT', '/api/usuarios/:id', { role: 'ADMIN' }, async ({ params, body }) => {
  const id = Number(params.id);
  validar(body, { criando: false });
  const [u] = await query('SELECT * FROM usuario WHERE id = $1', [id]);
  if (!u) fail(404, 'Usuário não encontrado.');
  const perfil = body.perfil !== undefined ? body.perfil : u.perfil;
  const ativo = body.ativo !== undefined ? !!body.ativo : u.ativo;
  await protegerUltimoAdmin(id, { perfil, ativo });
  const senhaHash = body.senha !== undefined ? bcrypt.hashSync(body.senha, 10) : u.senha_hash;
  await gravar('UPDATE usuario SET nome = $1, email = $2, perfil = $3, ativo = $4, senha_hash = $5 WHERE id = $6',
    [body.nome !== undefined ? body.nome.trim() : u.nome, body.email !== undefined ? body.email.trim() : u.email, perfil, ativo, senhaHash, id]);
  return ok({ ok: true });
});

add('DELETE', '/api/usuarios/:id', { role: 'ADMIN' }, async ({ params }) => {
  const id = Number(params.id);
  await protegerUltimoAdmin(id, { perfil: null, ativo: false });
  const [v] = await query('SELECT count(*)::int AS n FROM socio WHERE usuario_id = $1', [id]);
  if (v.n > 0) {
    await query('UPDATE usuario SET ativo = false WHERE id = $1', [id]);
    return ok({ inativado: true });
  }
  await query('DELETE FROM usuario WHERE id = $1', [id]);
  return ok({ excluido: true });
});
```
- [ ] **Step 4:** adicione `require('../routes/usuarios');` em `lib/app.js`; `npm test` PASS. **Commit:** `git add -A && git commit -m "feat: cadastro de usuários"`

---

### Task 9: Sócios e percentuais com vigência

**Files:**
- Create: `routes/socios.js`; Modify: `lib/app.js`
- Test: `test/socios.test.js`

**Interfaces:**
- Produces (ADMIN escreve; qualquer logado lê): `GET /api/socios -> [{id,nome,usuario_id,ativo,bp_atual,historico:[{vigente_desde,bp}]}]` (`bp_atual` = vigente no mês corrente, calculado com `vigentes`); `POST /api/socios {nome,usuario_id?} -> 201 {id}`; `PUT /api/socios/:id {nome?,usuario_id?,ativo?}`; `DELETE /api/socios/:id -> {excluido:true}|{inativado:true}` (inativa se tiver histórico de percentual ou aporte); `POST /api/percentuais {vigente_desde:'YYYY-MM', itens:[{socio_id,bp}]}` — `itens` deve conter **todo sócio ativo**, `bp` soma 10000, `vigente_desde` não pode ser ≤ ao último mês FECHADO (409).
- Consumes: `vigentes`, `somaValida`, `lib/validacao.js:ymValido` (criar aqui).

- [ ] **Step 1: `lib/validacao.js`** (usado também na Task 10)

```js
const { fail } = require('./router');

const ymValido = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s));
const dataValida = (s) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s));

const TIPOS = ['DEBITO', 'CREDITO'];
const FORMAS = ['BOLETO', 'GUIA', 'PIX', 'OUTRO'];
const RECORRENCIAS = ['NENHUMA', 'FIXO', 'PARCELADO'];
const STATUS = { DEBITO: ['A_PAGAR', 'PAGO'], CREDITO: ['A_RECEBER', 'RECEBIDO'] };

function lancamentoValido(b) {
  if (!TIPOS.includes(b.tipo)) fail(400, 'Informe se é débito ou crédito.');
  if (!String(b.descritivo || '').trim()) fail(400, 'Informe o descritivo.');
  if (!Number.isInteger(b.valor_centavos) || b.valor_centavos < 0) fail(400, 'Informe um valor válido.');
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

module.exports = { ymValido, dataValida, lancamentoValido };
```
- [ ] **Step 2: Teste**

`test/socios.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

async function cenario() {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  await app.criarUsuario({ email: 's@x.com', perfil: 'SOCIO' });
  const ca = await app.login('a@x.com');
  const ids = {};
  for (const n of ['Adriano', 'Henrique', 'Lígia', 'Luiz']) {
    ids[n] = (await app.call('POST', '/api/socios', { nome: n }, ca)).json.id;
  }
  return { app, ca, cs: await app.login('s@x.com'), ids };
}
const itens = (ids, bps) => Object.values(ids).map((socio_id, i) => ({ socio_id, bp: bps[i] }));

test('percentuais: soma 100% e cobertura de todos os sócios ativos', async () => {
  const { app, ca, ids } = await cenario();
  const r1 = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [2500, 3000, 2500, 1000]) }, ca);
  assert.strictEqual(r1.status, 400);
  const faltando = itens(ids, [2500, 3000, 2500, 2000]).slice(0, 3);
  assert.strictEqual((await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: faltando }, ca)).status, 400);
  const ok = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [2500, 3000, 2500, 2000]) }, ca);
  assert.strictEqual(ok.status, 200);
  const lista = await app.call('GET', '/api/socios', null, ca);
  assert.deepStrictEqual(lista.json.map((s) => s.historico.length), [1, 1, 1, 1]);
});
test('mudança futura mantém histórico; SOCIO lê mas não escreve', async () => {
  const { app, ca, cs, ids } = await cenario();
  await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [2500, 3000, 2500, 2000]) }, ca);
  await app.call('POST', '/api/percentuais', { vigente_desde: '2026-12', itens: itens(ids, [2500, 3500, 2500, 1500]) }, ca);
  const lista = await app.call('GET', '/api/socios', null, cs);
  assert.strictEqual(lista.status, 200);
  assert.strictEqual(lista.json[1].historico.length, 2);
  assert.strictEqual((await app.call('POST', '/api/socios', { nome: 'X' }, cs)).status, 403);
  assert.strictEqual((await app.call('POST', '/api/percentuais', { vigente_desde: '2026-12', itens: [] }, cs)).status, 403);
});
test('não altera percentual de mês fechado', async () => {
  const { app, ca, ids } = await cenario();
  await app.query("INSERT INTO mes (ym, status) VALUES ('2026-10', 'FECHADO')");
  const r = await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [2500, 3000, 2500, 2000]) }, ca);
  assert.strictEqual(r.status, 409);
});
test('excluir: apaga sem histórico, inativa com histórico', async () => {
  const { app, ca, ids } = await cenario();
  const novo = (await app.call('POST', '/api/socios', { nome: 'Novo' }, ca)).json.id;
  assert.deepStrictEqual((await app.call('DELETE', `/api/socios/${novo}`, null, ca)).json, { excluido: true });
  await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: itens(ids, [2500, 3000, 2500, 2000]) }, ca);
  assert.deepStrictEqual((await app.call('DELETE', `/api/socios/${ids.Luiz}`, null, ca)).json, { inativado: true });
});
```
- [ ] **Step 3: Rodar (FAIL)**; **Step 4: Implementar `routes/socios.js`**

```js
const { add, ok, fail } = require('../lib/router');
const { query, tx } = require('../lib/db');
const { vigentes, somaValida } = require('../lib/percentuais');
const { ymValido } = require('../lib/validacao');

const ymAtual = () => new Date().toISOString().slice(0, 7);

add('GET', '/api/socios', { role: 'AUTH' }, async () => {
  const socios = await query('SELECT id, nome, usuario_id, ativo FROM socio ORDER BY id');
  const hist = await query('SELECT socio_id, vigente_desde, bp FROM socio_percentual ORDER BY vigente_desde');
  const hoje = vigentes(hist, ymAtual());
  return ok(socios.map((s) => ({
    ...s,
    bp_atual: (hoje.find((h) => h.socio_id === s.id) || { bp: 0 }).bp,
    historico: hist.filter((h) => h.socio_id === s.id).map((h) => ({ vigente_desde: h.vigente_desde, bp: h.bp })),
  })));
});

add('POST', '/api/socios', { role: 'ADMIN' }, async ({ body }) => {
  if (!String(body.nome || '').trim()) fail(400, 'Informe o nome do sócio.');
  const [s] = await query('INSERT INTO socio (nome, usuario_id) VALUES ($1, $2) RETURNING id', [body.nome.trim(), body.usuario_id || null]);
  return ok({ id: s.id }, 201);
});

add('PUT', '/api/socios/:id', { role: 'ADMIN' }, async ({ params, body }) => {
  const [s] = await query('SELECT * FROM socio WHERE id = $1', [Number(params.id)]);
  if (!s) fail(404, 'Sócio não encontrado.');
  await query('UPDATE socio SET nome = $1, usuario_id = $2, ativo = $3 WHERE id = $4', [
    body.nome !== undefined ? String(body.nome).trim() : s.nome,
    body.usuario_id !== undefined ? body.usuario_id : s.usuario_id,
    body.ativo !== undefined ? !!body.ativo : s.ativo, s.id]);
  return ok({ ok: true });
});

add('DELETE', '/api/socios/:id', { role: 'ADMIN' }, async ({ params }) => {
  const id = Number(params.id);
  const [h] = await query('SELECT (SELECT count(*) FROM socio_percentual WHERE socio_id = $1)::int AS p, (SELECT count(*) FROM aporte WHERE socio_id = $1)::int AS a', [id]);
  if (h.p + h.a > 0) {
    await query('UPDATE socio SET ativo = false WHERE id = $1', [id]);
    return ok({ inativado: true });
  }
  await query('DELETE FROM socio WHERE id = $1', [id]);
  return ok({ excluido: true });
});

add('POST', '/api/percentuais', { role: 'ADMIN' }, async ({ body }) => {
  if (!ymValido(body.vigente_desde)) fail(400, 'Informe o mês de início (AAAA-MM).');
  const itens = Array.isArray(body.itens) ? body.itens : [];
  if (!itens.every((i) => Number.isInteger(i.bp) && i.bp >= 0)) fail(400, 'Percentual inválido.');
  const ativos = await query('SELECT id FROM socio WHERE ativo');
  const ids = new Set(itens.map((i) => i.socio_id));
  if (ativos.some((s) => !ids.has(s.id)) || ids.size !== itens.length) fail(400, 'Informe o percentual de todos os sócios ativos.');
  if (!somaValida(itens)) fail(400, 'Os percentuais precisam somar 100%.');
  const [f] = await query("SELECT max(ym) AS ym FROM mes WHERE status = 'FECHADO'");
  if (f.ym && body.vigente_desde <= f.ym) fail(409, 'Esse mês já está fechado. Escolha um mês posterior.');
  await tx(async (q) => {
    for (const i of itens) {
      await q('DELETE FROM socio_percentual WHERE socio_id = $1 AND vigente_desde = $2', [i.socio_id, body.vigente_desde]);
      await q('INSERT INTO socio_percentual (socio_id, vigente_desde, bp) VALUES ($1, $2, $3)', [i.socio_id, body.vigente_desde, i.bp]);
    }
  });
  return ok({ ok: true });
});
```
- [ ] **Step 5:** `require('../routes/socios');` em `lib/app.js`; `npm test` PASS. **Commit:** `git add -A && git commit -m "feat: sócios e percentuais com vigência"`

---

### Task 10: Meses (abrir, listar, ver) e lançamentos

**Files:**
- Create: `lib/mesdb.js`, `routes/meses.js`, `routes/lancamentos.js`; Modify: `lib/app.js`
- Test: `test/meses.test.js`, `test/lancamentos.test.js`

**Interfaces:**
- Consumes: `montarVisao`, `proximosLancamentos`, `proximoYm`, `lancamentoValido`, `ymValido`.
- Produces:
  - `mesdb.carregarVisao(ym, q = query) -> visao | null`.
  - `GET /api/meses -> [{ym,status,saldo_inicial_centavos,debitos}]` (mais recente primeiro); `GET /api/meses/:ym -> visao` (404 se não existe).
  - `POST /api/meses/abrir {ym, saldo_inicial_centavos?}`: o **primeiro** mês exige `saldo_inicial_centavos`; os seguintes exigem o mês anterior FECHADO e `ym` = próximo mês; saldo inicial = `saldo_final` do anterior; copia lançamentos com `proximosLancamentos`. Retorna `201 {ym}`.
  - `PUT /api/meses/:ym/saldo-inicial {saldo_inicial_centavos}` (só ABERTO).
  - `POST /api/meses/:ym/lancamentos` (cria, `ordem` = máx+1), `PUT /api/lancamentos/:id`, `DELETE /api/lancamentos/:id`. Mês FECHADO → 409 `Mês fechado. Reabra para editar.`

- [ ] **Step 1: `lib/mesdb.js`**

```js
const { query } = require('./db');
const { montarVisao } = require('./visao');

async function carregarVisao(ym, q = query) {
  const [mes] = await q('SELECT ym, status, saldo_inicial_centavos FROM mes WHERE ym = $1', [ym]);
  if (!mes) return null;
  const [lancamentos, socios, historico, aportes] = await Promise.all([
    q('SELECT * FROM lancamento WHERE ym = $1', [ym]),
    q('SELECT id, nome FROM socio'),
    q('SELECT socio_id, vigente_desde, bp FROM socio_percentual'),
    q('SELECT * FROM aporte WHERE ym = $1', [ym]),
  ]);
  return montarVisao({ mes, lancamentos, socios, historico, aportes });
}

module.exports = { carregarVisao };
```
- [ ] **Step 2: Testes**

`test/meses.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

async function cenario() {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  await app.criarUsuario({ email: 's@x.com', perfil: 'SOCIO' });
  return { app, ca: await app.login('a@x.com'), cs: await app.login('s@x.com') };
}

test('primeiro mês exige saldo inicial; SOCIO vê mas não abre', async () => {
  const { app, ca, cs } = await cenario();
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-10' }, ca)).status, 400);
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: -1623 }, cs)).status, 403);
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: -1623 }, ca)).status, 201);
  const v = await app.call('GET', '/api/meses/2026-10', null, cs);
  assert.strictEqual(v.json.saldo_inicial_centavos, -1623);
  assert.strictEqual((await app.call('GET', '/api/meses/2030-01', null, cs)).status, 404);
  assert.strictEqual((await app.call('GET', '/api/meses', null, cs)).json.length, 1);
});
test('próximo mês só abre com o anterior fechado, e copia fixos e parcelados', async () => {
  const { app, ca } = await cenario();
  await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: 0 }, ca);
  const mk = (o) => app.call('POST', '/api/meses/2026-10/lancamentos', { tipo: 'DEBITO', forma: 'GUIA', valor_centavos: 100, vencimento: '2026-10-25', ...o }, ca);
  await mk({ descritivo: 'ICMS', recorrencia: 'PARCELADO', parcela_atual: 17, parcela_total: 119 });
  await mk({ descritivo: 'Avulso' });
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-11' }, ca)).status, 409);
  await app.query("UPDATE mes SET status = 'FECHADO' WHERE ym = '2026-10'");
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-12' }, ca)).status, 400);
  assert.strictEqual((await app.call('POST', '/api/meses/abrir', { ym: '2026-11' }, ca)).status, 201);
  const v = (await app.call('GET', '/api/meses/2026-11', null, ca)).json;
  assert.strictEqual(v.lancamentos.length, 1);
  assert.strictEqual(v.lancamentos[0].parcela_atual, 18);
  assert.strictEqual(v.lancamentos[0].vencimento, '2026-11-25');
});
```
`test/lancamentos.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

const corpo = { tipo: 'DEBITO', descritivo: 'Contabilidade', valor_centavos: 26700, vencimento: '2026-10-15', forma: 'BOLETO' };
async function cenario() {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  await app.criarUsuario({ email: 's@x.com', perfil: 'SOCIO' });
  const ca = await app.login('a@x.com');
  await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: -1623 }, ca);
  return { app, ca, cs: await app.login('s@x.com') };
}

test('cria, valida, edita e exclui', async () => {
  const { app, ca } = await cenario();
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/lancamentos', { ...corpo, valor_centavos: -5 }, ca)).status, 400);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/lancamentos', { ...corpo, vencimento: '15/10/2026' }, ca)).status, 400);
  const c = await app.call('POST', '/api/meses/2026-10/lancamentos', corpo, ca);
  assert.strictEqual(c.status, 201);
  const id = c.json.id;
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${id}`, { ...corpo, status: 'PAGO' }, ca)).status, 200);
  const v = (await app.call('GET', '/api/meses/2026-10', null, ca)).json;
  assert.strictEqual(v.lancamentos[0].status, 'PAGO');
  assert.strictEqual(v.lancamentos[0].saldo_centavos, -28323);
  assert.strictEqual((await app.call('DELETE', `/api/lancamentos/${id}`, null, ca)).status, 200);
});
test('SOCIO não escreve; mês fechado recusa edição', async () => {
  const { app, ca, cs } = await cenario();
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/lancamentos', corpo, cs)).status, 403);
  const id = (await app.call('POST', '/api/meses/2026-10/lancamentos', corpo, ca)).json.id;
  await app.query("UPDATE mes SET status = 'FECHADO'");
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/lancamentos', corpo, ca)).status, 409);
  assert.strictEqual((await app.call('PUT', `/api/lancamentos/${id}`, corpo, ca)).status, 409);
  assert.strictEqual((await app.call('DELETE', `/api/lancamentos/${id}`, null, ca)).status, 409);
});
```
- [ ] **Step 3: Rodar (FAIL)**; **Step 4: Implementar `routes/meses.js`**

```js
const { add, ok, fail } = require('../lib/router');
const { query, tx } = require('../lib/db');
const { carregarVisao } = require('../lib/mesdb');
const { proximoYm } = require('../lib/datas');
const { proximosLancamentos } = require('../lib/abertura');
const { ymValido } = require('../lib/validacao');

add('GET', '/api/meses', { role: 'AUTH' }, async () => ok(await query(
  `SELECT m.ym, m.status, m.saldo_inicial_centavos,
          COALESCE((SELECT sum(valor_centavos) FROM lancamento l WHERE l.ym = m.ym AND l.tipo = 'DEBITO'), 0)::int AS debitos
     FROM mes m ORDER BY m.ym DESC`)));

add('GET', '/api/meses/:ym', { role: 'AUTH' }, async ({ params }) => {
  const v = await carregarVisao(params.ym);
  if (!v) fail(404, 'Mês não encontrado.');
  return ok(v);
});

add('POST', '/api/meses/abrir', { role: 'ADMIN' }, async ({ body }) => {
  if (!ymValido(body.ym)) fail(400, 'Informe o mês (AAAA-MM).');
  const [existe] = await query('SELECT 1 FROM mes WHERE ym = $1', [body.ym]);
  if (existe) fail(409, 'Esse mês já foi aberto.');
  const [ult] = await query('SELECT ym, status FROM mes ORDER BY ym DESC LIMIT 1');
  let saldoInicial; let copiar = [];
  if (!ult) {
    if (!Number.isInteger(body.saldo_inicial_centavos)) fail(400, 'Informe o saldo inicial do banco.');
    saldoInicial = body.saldo_inicial_centavos;
  } else {
    if (ult.status !== 'FECHADO') fail(409, 'Feche o mês anterior antes de abrir o próximo.');
    if (body.ym !== proximoYm(ult.ym)) fail(400, `O próximo mês é ${proximoYm(ult.ym)}.`);
    const anterior = await carregarVisao(ult.ym);
    saldoInicial = anterior.totais.saldo_final;
    copiar = proximosLancamentos(anterior.lancamentos, body.ym);
  }
  await tx(async (q) => {
    await q('INSERT INTO mes (ym, saldo_inicial_centavos) VALUES ($1, $2)', [body.ym, saldoInicial]);
    let ordem = 0;
    for (const l of copiar) {
      ordem += 1;
      await q(`INSERT INTO lancamento (ym, tipo, descritivo, valor_centavos, vencimento, forma, status, ordem, recorrencia, parcela_atual, parcela_total)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [body.ym, l.tipo, l.descritivo, l.valor_centavos, l.vencimento, l.forma, l.status, ordem, l.recorrencia, l.parcela_atual, l.parcela_total]);
    }
  });
  return ok({ ym: body.ym }, 201);
});

add('PUT', '/api/meses/:ym/saldo-inicial', { role: 'ADMIN' }, async ({ params, body }) => {
  const [m] = await query('SELECT status FROM mes WHERE ym = $1', [params.ym]);
  if (!m) fail(404, 'Mês não encontrado.');
  if (m.status === 'FECHADO') fail(409, 'Mês fechado. Reabra para editar.');
  if (!Number.isInteger(body.saldo_inicial_centavos)) fail(400, 'Informe um valor válido.');
  await query('UPDATE mes SET saldo_inicial_centavos = $1 WHERE ym = $2', [body.saldo_inicial_centavos, params.ym]);
  return ok({ ok: true });
});
```
`routes/lancamentos.js`:
```js
const { add, ok, fail } = require('../lib/router');
const { query } = require('../lib/db');
const { lancamentoValido } = require('../lib/validacao');

async function mesAberto(ym) {
  const [m] = await query('SELECT status FROM mes WHERE ym = $1', [ym]);
  if (!m) fail(404, 'Mês não encontrado.');
  if (m.status === 'FECHADO') fail(409, 'Mês fechado. Reabra para editar.');
}

add('POST', '/api/meses/:ym/lancamentos', { role: 'ADMIN' }, async ({ params, body }) => {
  await mesAberto(params.ym);
  const l = lancamentoValido(body);
  const [o] = await query('SELECT COALESCE(max(ordem), 0) + 1 AS ordem FROM lancamento WHERE ym = $1', [params.ym]);
  const [r] = await query(
    `INSERT INTO lancamento (ym, tipo, descritivo, valor_centavos, vencimento, forma, status, ordem, recorrencia, parcela_atual, parcela_total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [params.ym, l.tipo, l.descritivo, l.valor_centavos, l.vencimento, l.forma, l.status, o.ordem, l.recorrencia, l.parcela_atual, l.parcela_total]);
  return ok({ id: r.id }, 201);
});

async function doLancamento(id) {
  const [l] = await query('SELECT id, ym FROM lancamento WHERE id = $1', [Number(id)]);
  if (!l) fail(404, 'Lançamento não encontrado.');
  await mesAberto(l.ym);
  return l;
}

add('PUT', '/api/lancamentos/:id', { role: 'ADMIN' }, async ({ params, body }) => {
  const l0 = await doLancamento(params.id);
  const l = lancamentoValido(body);
  await query(
    `UPDATE lancamento SET tipo=$1, descritivo=$2, valor_centavos=$3, vencimento=$4, forma=$5, status=$6,
            recorrencia=$7, parcela_atual=$8, parcela_total=$9 WHERE id=$10`,
    [l.tipo, l.descritivo, l.valor_centavos, l.vencimento, l.forma, l.status, l.recorrencia, l.parcela_atual, l.parcela_total, l0.id]);
  return ok({ ok: true });
});

add('DELETE', '/api/lancamentos/:id', { role: 'ADMIN' }, async ({ params }) => {
  const l = await doLancamento(params.id);
  await query('DELETE FROM lancamento WHERE id = $1', [l.id]);
  return ok({ ok: true });
});
```
- [ ] **Step 5:** `lib/app.js` ganha `require('../routes/meses'); require('../routes/lancamentos');`. `npm test` PASS. **Commit:** `git add -A && git commit -m "feat: meses e lançamentos"`

---

### Task 11: Aportes, fechar e reabrir mês

**Files:**
- Create: `routes/aportes.js`; Modify: `lib/app.js`
- Test: `test/aportes-api.test.js`

**Interfaces:**
- Produces (ADMIN):
  - `PUT /api/meses/:ym/aportes/:socioId {ajuste_centavos?, ajuste_motivo?, ajuste_origem?, status?}`. Mês ABERTO: aceita `ajuste_*` (ajuste ≠ 0 exige `ajuste_motivo` e `ajuste_origem` válida `AAAA-MM`); `status` só vale para mês FECHADO (ABERTO → 409 `O aporte só pode ser marcado como pago depois de fechar o mês.`). Mês FECHADO: só `status`; enviar `ajuste_*` → 409.
  - `POST /api/meses/:ym/fechar {vencimento_aportes?='AAAA-MM-15', confirmar_diferenca?}`: grava as linhas de `aporte` (`bp, base, ajuste, final, vencimento`, preservando `status`) e marca FECHADO. Se `totais.diferenca ≠ 0` e `confirmar_diferenca !== true` → 409 com `{erro, diferenca_centavos}`. Sem percentuais vigentes que somem 10000 → 409 `Defina os percentuais dos sócios para este mês.`
  - `POST /api/meses/:ym/reabrir`: só se FECHADO e **não existe mês posterior**; zera `bp, base, final, vencimento` dos aportes (mantém ajuste e status) e volta a ABERTO.

- [ ] **Step 1: Teste**

`test/aportes-api.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { criarApp } = require('./helpers/app');

async function cenario() {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  const ca = await app.login('a@x.com');
  const ids = {};
  for (const n of ['Adriano', 'Henrique', 'Lígia', 'Luiz']) ids[n] = (await app.call('POST', '/api/socios', { nome: n }, ca)).json.id;
  await app.call('POST', '/api/percentuais', { vigente_desde: '2026-10', itens: Object.values(ids).map((socio_id, i) => ({ socio_id, bp: [2500, 3000, 2500, 2000][i] })) }, ca);
  await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: -1623 }, ca);
  const mk = (descritivo, v, d, forma) => app.call('POST', '/api/meses/2026-10/lancamentos', { tipo: 'DEBITO', descritivo, valor_centavos: v, vencimento: d, forma }, ca);
  await mk('Contabilidade', 26700, '2026-10-15', 'BOLETO');
  await mk('Condominio', 338304, '2026-10-20', 'BOLETO');
  await mk('ICMS', 155521, '2026-10-25', 'GUIA');
  await mk('DASN', 30225, '2026-10-25', 'GUIA');
  return { app, ca, ids };
}

test('fechar grava aportes de outubro/26 e congela', async () => {
  const { app, ca } = await cenario();
  const f = await app.call('POST', '/api/meses/2026-10/fechar', {}, ca);
  assert.strictEqual(f.status, 200);
  const v = (await app.call('GET', '/api/meses/2026-10', null, ca)).json;
  assert.strictEqual(v.status, 'FECHADO');
  assert.strictEqual(v.provisorio, false);
  assert.deepStrictEqual(v.aportes.map((a) => a.final_centavos), [138093, 165712, 138093, 110475]);
  assert.strictEqual(v.totais.saldo_final, 0);
});
test('ajuste exige motivo e origem; diferença exige confirmação', async () => {
  const { app, ca, ids } = await cenario();
  const url = `/api/meses/2026-10/aportes/${ids['Lígia']}`;
  assert.strictEqual((await app.call('PUT', url, { ajuste_centavos: -30225 }, ca)).status, 400);
  assert.strictEqual((await app.call('PUT', url, { ajuste_centavos: -30225, ajuste_motivo: 'Acerto de setembro com o Henrique', ajuste_origem: '2026-09' }, ca)).status, 200);
  const r = await app.call('POST', '/api/meses/2026-10/fechar', {}, ca);
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.json.diferenca_centavos, -30225);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/fechar', { confirmar_diferenca: true }, ca)).status, 200);
  const v = (await app.call('GET', '/api/meses/2026-10', null, ca)).json;
  assert.strictEqual(v.aportes[2].final_centavos, 107868);
});
test('marcar pago só depois de fechar; ajuste trava no fechado', async () => {
  const { app, ca, ids } = await cenario();
  const url = `/api/meses/2026-10/aportes/${ids.Adriano}`;
  assert.strictEqual((await app.call('PUT', url, { status: 'PAGO' }, ca)).status, 409);
  await app.call('POST', '/api/meses/2026-10/fechar', {}, ca);
  assert.strictEqual((await app.call('PUT', url, { status: 'PAGO' }, ca)).status, 200);
  assert.strictEqual((await app.call('PUT', url, { ajuste_centavos: 5, ajuste_motivo: 'x', ajuste_origem: '2026-09' }, ca)).status, 409);
  const v = (await app.call('GET', '/api/meses/2026-10', null, ca)).json;
  assert.strictEqual(v.aportes[0].status, 'PAGO');
});
test('reabrir só sem mês posterior', async () => {
  const { app, ca } = await cenario();
  await app.call('POST', '/api/meses/2026-10/fechar', {}, ca);
  await app.call('POST', '/api/meses/abrir', { ym: '2026-11' }, ca);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/reabrir', {}, ca)).status, 409);
  await app.query("DELETE FROM mes WHERE ym = '2026-11'");
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/reabrir', {}, ca)).status, 200);
  assert.strictEqual((await app.call('GET', '/api/meses/2026-10', null, ca)).json.status, 'ABERTO');
});
test('fechar sem percentuais recusa', async () => {
  const app = await criarApp();
  await app.criarUsuario({ email: 'a@x.com', perfil: 'ADMIN' });
  const ca = await app.login('a@x.com');
  await app.call('POST', '/api/meses/abrir', { ym: '2026-10', saldo_inicial_centavos: 0 }, ca);
  assert.strictEqual((await app.call('POST', '/api/meses/2026-10/fechar', {}, ca)).status, 409);
});
```
- [ ] **Step 2: Rodar (FAIL)**; **Step 3: Implementar `routes/aportes.js`**

```js
const { add, ok, fail } = require('../lib/router');
const { query, tx } = require('../lib/db');
const { carregarVisao } = require('../lib/mesdb');
const { ymValido } = require('../lib/validacao');
const { vigentes, somaValida } = require('../lib/percentuais');

add('PUT', '/api/meses/:ym/aportes/:socioId', { role: 'ADMIN' }, async ({ params, body }) => {
  const [m] = await query('SELECT status FROM mes WHERE ym = $1', [params.ym]);
  if (!m) fail(404, 'Mês não encontrado.');
  const socioId = Number(params.socioId);
  const mexeAjuste = ['ajuste_centavos', 'ajuste_motivo', 'ajuste_origem'].some((k) => body[k] !== undefined);

  if (m.status === 'FECHADO') {
    if (mexeAjuste) fail(409, 'Mês fechado. Reabra para alterar o acerto.');
    if (!['PENDENTE', 'PAGO'].includes(body.status)) fail(400, 'Situação inválida.');
    const r = await query('UPDATE aporte SET status = $1 WHERE ym = $2 AND socio_id = $3 RETURNING socio_id', [body.status, params.ym, socioId]);
    if (!r.length) fail(404, 'Aporte não encontrado.');
    return ok({ ok: true });
  }

  if (body.status !== undefined) fail(409, 'O aporte só pode ser marcado como pago depois de fechar o mês.');
  const ajuste = body.ajuste_centavos === undefined ? 0 : body.ajuste_centavos;
  if (!Number.isInteger(ajuste)) fail(400, 'Informe um valor válido para o acerto.');
  if (ajuste !== 0) {
    if (!String(body.ajuste_motivo || '').trim()) fail(400, 'Informe o motivo do acerto.');
    if (!ymValido(body.ajuste_origem)) fail(400, 'Informe o mês de origem do acerto (AAAA-MM).');
  }
  await query(
    `INSERT INTO aporte (ym, socio_id, ajuste_centavos, ajuste_motivo, ajuste_origem) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (ym, socio_id) DO UPDATE SET ajuste_centavos = $3, ajuste_motivo = $4, ajuste_origem = $5`,
    [params.ym, socioId, ajuste, ajuste ? body.ajuste_motivo.trim() : null, ajuste ? body.ajuste_origem : null]);
  return ok({ ok: true });
});

add('POST', '/api/meses/:ym/fechar', { role: 'ADMIN' }, async ({ params, body }) => {
  const [m] = await query('SELECT status FROM mes WHERE ym = $1', [params.ym]);
  if (!m) fail(404, 'Mês não encontrado.');
  if (m.status === 'FECHADO') fail(409, 'Esse mês já está fechado.');
  const hist = await query('SELECT socio_id, vigente_desde, bp FROM socio_percentual');
  if (!somaValida(vigentes(hist, params.ym))) fail(409, 'Defina os percentuais dos sócios para este mês.');
  const v = await carregarVisao(params.ym);
  if (v.totais.diferenca !== 0 && body.confirmar_diferenca !== true) {
    return { status: 409, json: {
      erro: 'A soma dos aportes não bate com o valor a cobrir. Confirme para fechar assim mesmo.',
      diferenca_centavos: v.totais.diferenca } };
  }
  const venc = body.vencimento_aportes || `${params.ym}-15`;
  await tx(async (q) => {
    for (const a of v.aportes) {
      await q(
        `INSERT INTO aporte (ym, socio_id, bp, base_centavos, ajuste_centavos, ajuste_motivo, ajuste_origem, final_centavos, vencimento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (ym, socio_id) DO UPDATE SET bp=$3, base_centavos=$4, ajuste_centavos=$5, ajuste_motivo=$6,
           ajuste_origem=$7, final_centavos=$8, vencimento=$9`,
        [params.ym, a.socio_id, a.bp, a.base_centavos, a.ajuste_centavos, a.ajuste_motivo, a.ajuste_origem, a.final_centavos, venc]);
    }
    await q("UPDATE mes SET status = 'FECHADO' WHERE ym = $1", [params.ym]);
  });
  return ok({ ok: true });
});

add('POST', '/api/meses/:ym/reabrir', { role: 'ADMIN' }, async ({ params }) => {
  const [m] = await query('SELECT status FROM mes WHERE ym = $1', [params.ym]);
  if (!m) fail(404, 'Mês não encontrado.');
  if (m.status !== 'FECHADO') fail(409, 'Esse mês já está aberto.');
  const [pos] = await query('SELECT 1 FROM mes WHERE ym > $1 LIMIT 1', [params.ym]);
  if (pos) fail(409, 'Só dá para reabrir o mês mais recente.');
  await tx(async (q) => {
    await q('UPDATE aporte SET bp = NULL, base_centavos = NULL, final_centavos = NULL, vencimento = NULL WHERE ym = $1', [params.ym]);
    await q("UPDATE mes SET status = 'ABERTO' WHERE ym = $1", [params.ym]);
  });
  return ok({ ok: true });
});
```
- [ ] **Step 4:** `require('../routes/aportes');` em `lib/app.js`; `npm test` PASS (suite completa). **Commit:** `git add -A && git commit -m "feat: aportes, fechamento e reabertura do mês"`

---

### Task 12: Seed, migração e implantação do back-end

**Files:**
- Create: `scripts/seed.js`, `scripts/seed-outubro.js`

**Interfaces:**
- `npm run seed` lê `ADMIN_EMAIL`, `ADMIN_NOME`, `ADMIN_PASSWORD` do ambiente (recusa se ausentes ou senha < 8) e cria o ADMIN e os 4 sócios com os percentuais vigentes desde `2026-10` (Adriano 2500, Henrique 3000, Lígia 2500, Luiz 2000). É idempotente (não duplica).
- `node scripts/seed-outubro.js` abre 2026-10 com saldo inicial −1623 e os 4 débitos da planilha (usado só na conferência, Task 17).

- [ ] **Step 1: `scripts/seed.js`**

```js
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

(async () => {
  const { ADMIN_EMAIL, ADMIN_NOME = 'Administrador', ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
    console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mín. 8 caracteres) no ambiente.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const q = async (s, p = []) => (await pool.query(s, p)).rows;
  if (!(await q('SELECT 1 FROM usuario WHERE lower(email) = lower($1)', [ADMIN_EMAIL])).length) {
    await q('INSERT INTO usuario (nome, email, senha_hash, perfil) VALUES ($1,$2,$3,$4)', [ADMIN_NOME, ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASSWORD, 10), 'ADMIN']);
    console.log('administrador criado');
  }
  for (const [nome, bp] of [['Adriano', 2500], ['Henrique', 3000], ['Lígia', 2500], ['Luiz', 2000]]) {
    let [s] = await q('SELECT id FROM socio WHERE nome = $1', [nome]);
    if (!s) [s] = await q('INSERT INTO socio (nome) VALUES ($1) RETURNING id', [nome]);
    await q('INSERT INTO socio_percentual (socio_id, vigente_desde, bp) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [s.id, '2026-10', bp]);
  }
  console.log('sócios e percentuais prontos');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
```
- [ ] **Step 2: `scripts/seed-outubro.js`**

```js
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
```
- [ ] **Step 3: Criar o projeto na Vercel e o banco** (passos manuais no painel/CLI; o executor usa a CLI `vercel` já logada)

```bash
vercel link          # cria o projeto "acertos-patroni"
```
No painel da Vercel → Storage → Create Database → Neon (Marketplace) → conectar ao projeto (injeta `DATABASE_URL`). Depois: `vercel env pull .env.local` e, em Production/Preview/Development, definir `SESSION_SECRET` (string aleatória longa, só ASCII): `vercel env add SESSION_SECRET`.

- [ ] **Step 4: Migrar e popular**

```bash
set -a; . ./.env.local; set +a
npm run migrate
ADMIN_EMAIL="<email do administrador>" ADMIN_PASSWORD="<definida por Gilmar>" npm run seed
```
Expected: `aplicada 001_init.sql`, `administrador criado`, `sócios e percentuais prontos`. **A senha é definida pelo Gilmar** (o executor não inventa nem repete a senha em chat/commit).

- [ ] **Step 5: Deploy e conferência do back-end**

```bash
vercel deploy --prod
curl -s -o /dev/null -w "%{http_code}\n" https://<dominio>/api/me
```
Expected: `401`. **Commit:** `git add -A && git commit -m "chore: seed e scripts de implantação"`

---

### Task 13: Casca do PWA (index, estilo, ícones, manifest, service worker, login)

**Files:**
- Create: `public/index.html`, `public/style.css`, `public/manifest.webmanifest`, `public/sw.js`, `public/icons/icon.svg`, `scripts/gen-icons.js`, `public/js/api.mjs`, `public/js/ui.mjs`, `public/js/app.mjs`, `public/js/telas/login.mjs`

**Interfaces:**
- `api(method, path, body?) -> Promise<json>`; em erro lança `Error(mensagem)`; em 401 emite `window` event `sessao-expirada`.
- `ui`: `h(tag, props, ...filhos) -> Element`, `toast(msg)`, `confirmar(msg) -> Promise<boolean>`, `moeda(centavos) -> string` (reexporta `formatBRL`), `corSaldo(centavos) -> 'neg'|''`.
- Cada tela exporta `async function render(estado) -> Node`. `estado = { user, ym, irPara(hash) }`.
- `app.mjs` mantém o `estado`, o roteador por hash e a navegação inferior por perfil.

- [ ] **Step 1: `public/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Acertos Patroni</title>
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#1f3a5f">
  <link rel="icon" href="/icons/icon-192.png">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <main id="app"></main>
  <nav id="nav" hidden></nav>
  <script type="module" src="/js/app.mjs"></script>
</body>
</html>
```
- [ ] **Step 2: `public/manifest.webmanifest`**

```json
{
  "name": "Acertos Patroni",
  "short_name": "Acertos",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1f3a5f",
  "lang": "pt-BR",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
- [ ] **Step 3: Ícones.** `public/icons/icon.svg` (símbolo de balança/saldo simples, fundo `#1f3a5f` ocupando todo o quadrado, símbolo dentro de 60% central para servir ao `maskable`):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1f3a5f"/><g fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"><path d="M256 150v212M180 362h152M170 200h172"/><path d="M170 200l-48 90h96zM342 200l-48 90h96z"/></g></svg>
```
`scripts/gen-icons.js`:
```js
const sharp = require('sharp');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync('public/icons/icon.svg');
  for (const n of [192, 512]) await sharp(svg).resize(n, n).png().toFile(`public/icons/icon-${n}.png`);
  console.log('ícones gerados');
})();
```
Run: `npm run icons` → Expected: `ícones gerados`.

- [ ] **Step 4: `public/style.css`** (mobile-first, sem biblioteca)

```css
:root{--azul:#1f3a5f;--fundo:#f4f6f9;--card:#fff;--linha:#e3e7ee;--txt:#1b2430;--suave:#6a7587;--neg:#c0392b;--pos:#1e8449;--aviso:#b9770e}
*{box-sizing:border-box}
body{margin:0;font:16px/1.4 system-ui,sans-serif;background:var(--fundo);color:var(--txt);padding-bottom:calc(64px + env(safe-area-inset-bottom))}
main{max-width:560px;margin:0 auto;padding:12px 16px}
h1{font-size:20px;margin:0}
.topo{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px}
.card{background:var(--card);border:1px solid var(--linha);border-radius:10px;padding:12px;margin-bottom:10px}
.grade{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.suave{color:var(--suave);font-size:13px}.neg{color:var(--neg)}.pos{color:var(--pos)}
.grande{font-size:26px;font-weight:600}
.linha{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--linha)}
.linha:last-child{border-bottom:0}
.tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:8px;background:#e6edf7;color:var(--azul)}
.tag.ok{background:#e3f4ea;color:var(--pos)}.tag.aviso{background:#fbf0dc;color:var(--aviso)}
button,.btn{font:inherit;border:0;border-radius:8px;padding:12px 14px;background:var(--azul);color:#fff;min-height:44px;cursor:pointer}
button.sec{background:#e6edf7;color:var(--azul)}button.perigo{background:var(--neg)}
button.largo{width:100%}
input,select,textarea{font:inherit;width:100%;padding:11px;border:1px solid var(--linha);border-radius:8px;background:#fff;min-height:44px}
label{display:block;font-size:13px;color:var(--suave);margin:10px 0 4px}
.barra{height:8px;border-radius:4px;background:#dfe6f1;overflow:hidden}.barra b{display:block;height:100%;background:var(--azul)}
#nav{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:space-around;background:#fff;border-top:1px solid var(--linha);padding:6px 0 calc(6px + env(safe-area-inset-bottom))}
#nav a{flex:1;text-align:center;font-size:12px;color:var(--suave);text-decoration:none;padding:6px 0}
#nav a.ativo{color:var(--azul);font-weight:600}
.toast{position:fixed;left:16px;right:16px;bottom:80px;background:#1b2430;color:#fff;padding:12px;border-radius:8px;text-align:center}
dialog{border:0;border-radius:12px;padding:16px;max-width:360px;width:calc(100% - 32px)}
dialog::backdrop{background:rgba(0,0,0,.4)}
.acoes{display:flex;gap:8px;margin-top:14px}.acoes>*{flex:1}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{padding:8px 12px;border-radius:16px;background:#e6edf7;color:var(--azul);cursor:pointer}.chip.sel{background:var(--azul);color:#fff}
.fab{position:fixed;right:16px;bottom:78px;border-radius:50%;width:56px;height:56px;font-size:28px;padding:0}
.somente-impressao{display:none}
@media print{#nav,.nao-imprime,.fab{display:none!important}body{background:#fff;padding:0}.somente-impressao{display:block}main{max-width:none}}
```
- [ ] **Step 5: `public/js/api.mjs` e `public/js/ui.mjs`**

`api.mjs`:
```js
export async function api(method, path, body) {
  const r = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* sem corpo */ }
  if (r.status === 401 && path !== '/api/login') window.dispatchEvent(new Event('sessao-expirada'));
  if (!r.ok) {
    const e = new Error((json && json.erro) || 'Não foi possível concluir. Tente de novo.');
    e.dados = json; e.status = r.status;
    throw e;
  }
  return json;
}
```
`ui.mjs`:
```js
import { formatBRL } from './money.mjs';

export function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) {
    if (f == null || f === false) continue;
    el.append(f.nodeType ? f : document.createTextNode(String(f)));
  }
  return el;
}

export const moeda = (c) => formatBRL(c);
export const corSaldo = (c) => (c < 0 ? 'neg' : '');

export function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

export function confirmar(msg, rotulo = 'Confirmar') {
  return new Promise((resolve) => {
    const d = h('dialog', {}, h('p', {}, msg), h('div', { class: 'acoes' },
      h('button', { class: 'sec', onclick: () => { d.close(); resolve(false); } }, 'Cancelar'),
      h('button', { onclick: () => { d.close(); resolve(true); } }, rotulo)));
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
  });
}
```
- [ ] **Step 6: `public/js/telas/login.mjs`**

```js
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
```
- [ ] **Step 7: `public/js/app.mjs`** (roteador; telas serão carregadas por import dinâmico)

```js
import { h } from './ui.mjs';
import { api } from './api.mjs';

const estado = { user: null, ym: null, irPara: (hash) => { location.hash = hash; } };
try { estado.ym = localStorage.getItem('ym'); } catch { /* sem storage */ }
export function guardarYm(ym) { estado.ym = ym; try { localStorage.setItem('ym', ym); } catch { /* sem storage */ } }
estado.guardarYm = guardarYm;

const TELAS = {
  painel: ['painel.mjs', 'Painel', 'ti-home'],
  lancamentos: ['lancamentos.mjs', 'Lançamentos', 'ti-list'],
  aportes: ['aportes.mjs', 'Aportes', 'ti-users'],
  meses: ['meses.mjs', 'Meses', 'ti-calendar'],
  socios: ['socios.mjs', 'Sócios', null],
  usuarios: ['usuarios.mjs', 'Usuários', null],
  lancamento: ['lancamento-form.mjs', 'Lançamento', null],
  exportar: ['exportar.mjs', 'Exportar', null],
};
const ABAS = ['painel', 'lancamentos', 'aportes', 'meses'];

function montarNav(ativa) {
  const nav = document.getElementById('nav');
  nav.hidden = !estado.user;
  nav.replaceChildren(...ABAS.map((k) => h('a', { href: `#/${k}`, class: k === ativa ? 'ativo' : '' }, TELAS[k][1])));
  if (estado.user && estado.user.perfil === 'ADMIN') {
    nav.append(h('a', { href: '#/mais', class: ['mais', 'socios', 'usuarios'].includes(ativa) ? 'ativo' : '' }, 'Mais'));
  }
}

async function rotear() {
  const app = document.getElementById('app');
  if (!estado.user) {
    try { estado.user = await api('GET', '/api/me'); } catch { estado.user = null; }
  }
  const [, nome = 'painel', arg] = location.hash.split('/');
  if (!estado.user) {
    montarNav(null);
    return app.replaceChildren(await (await import('./telas/login.mjs')).render(estado));
  }
  if (nome === 'mais') {
    montarNav('mais');
    return app.replaceChildren(h('div', {},
      h('div', { class: 'topo' }, h('h1', {}, 'Mais')),
      h('a', { class: 'btn largo card', href: '#/socios' }, 'Sócios e percentuais'),
      h('a', { class: 'btn largo card', href: '#/usuarios' }, 'Usuários'),
      h('button', { class: 'sec largo', onclick: async () => {
        await api('POST', '/api/logout');
        try { await caches.delete('api'); } catch { /* sem cache */ }
        estado.user = null; location.hash = '#/'; rotear();
      } }, 'Sair')));
  }
  const def = TELAS[nome] || TELAS.painel;
  montarNav(nome);
  estado.arg = arg;
  try {
    app.replaceChildren(await (await import(`./telas/${def[0]}`)).render(estado));
  } catch (e) {
    app.replaceChildren(h('div', { class: 'card' }, e.message));
  }
}

window.addEventListener('hashchange', rotear);
window.addEventListener('sessao-expirada', () => { estado.user = null; rotear(); });
rotear();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
```
SOCIO não tem o botão "Mais" e as telas de escrita (Sócios/Usuários/Novo lançamento) devolvem 403 do servidor se acessadas por URL; as telas também escondem os botões (Tasks 14–16).

- [ ] **Step 8: `public/sw.js`** (shell em cache; leituras de `/api/meses*` e `/api/socios` network-first com cache de reserva)

```js
const SHELL = 'shell-v1';
const API = 'api';
const ARQUIVOS = ['/', '/style.css', '/manifest.webmanifest', '/js/app.mjs', '/js/api.mjs', '/js/ui.mjs', '/js/money.mjs', '/js/cobranca.mjs'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (!/^\/api\/(meses|socios)/.test(url.pathname)) return;
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const c = r.clone(); caches.open(API).then((ca) => ca.put(req, c)); }
      return r;
    }).catch(() => caches.match(req, { cacheName: API })));
    return;
  }
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const c = r.clone(); caches.open(SHELL).then((ca) => ca.put(req, c)); }
    return r;
  }).catch(() => caches.match(req)));
});
```
- [ ] **Step 9: Verificação.** `vercel dev` (ou deploy de preview); abrir a URL no navegador: tela de login aparece, entrar com o ADMIN do seed leva ao hash `#/painel` (a tela ainda não existe → mostra o erro do `import`, esperado). Em Chrome DevTools → Application: manifest sem erros, "installable" ok, service worker ativo. **Commit:** `git add -A && git commit -m "feat: casca do PWA, login e service worker"`

---

### Task 14: Telas Painel, Lançamentos, Novo/editar lançamento

**Files:**
- Create: `public/js/telas/painel.mjs`, `public/js/telas/lancamentos.mjs`, `public/js/telas/lancamento-form.mjs`
- Create: `public/js/telas/seletor-mes.mjs` (componente compartilhado)

**Interfaces:**
- `seletorMes(estado, meses) -> Element` (select de mês; ao mudar chama `estado.guardarYm(ym)` e re-roteia com `location.reload()` suave via `dispatchEvent(new Event('hashchange'))`).
- `escolherYm(estado, meses) -> ym` (usa `estado.ym` se existir na lista, senão o mais recente).
- `rotuloLancamento(l) -> string` = descritivo + (` ${parcela_atual}/${parcela_total}` se PARCELADO).

- [ ] **Step 1: `seletor-mes.mjs`**

```js
import { h } from '../ui.mjs';
import { nomeDoMes } from '../cobranca.mjs';

export function escolherYm(estado, meses) {
  if (estado.ym && meses.some((m) => m.ym === estado.ym)) return estado.ym;
  return meses.length ? meses[0].ym : null;
}

export function seletorMes(estado, meses, atual) {
  return h('select', { 'aria-label': 'Mês', onchange: (ev) => {
    estado.guardarYm(ev.target.value);
    window.dispatchEvent(new Event('hashchange'));
  } }, meses.map((m) => h('option', { value: m.ym, selected: m.ym === atual }, nomeDoMes(m.ym))));
}

export const rotuloLancamento = (l) =>
  l.recorrencia === 'PARCELADO' ? `${l.descritivo} ${l.parcela_atual}/${l.parcela_total}` : l.descritivo;
```
- [ ] **Step 2: `painel.mjs`** (Tela 1)

```js
import { h, moeda, corSaldo, confirmar, toast } from '../ui.mjs';
import { api } from '../api.mjs';
import { escolherYm, seletorMes, rotuloLancamento } from './seletor-mes.mjs';

const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function render(estado) {
  const meses = await api('GET', '/api/meses');
  const ym = escolherYm(estado, meses);
  const admin = estado.user.perfil === 'ADMIN';
  if (!ym) return h('div', { class: 'card' }, h('p', {}, 'Nenhum mês aberto ainda.'),
    admin ? h('a', { class: 'btn', href: '#/meses' }, 'Abrir o primeiro mês') : null);
  const v = await api('GET', `/api/meses/${ym}`);
  const pagos = v.aportes.filter((a) => a.status === 'PAGO').length;
  const recebido = v.aportes.filter((a) => a.status === 'PAGO').reduce((s, a) => s + a.final_centavos, 0);
  const proximos = v.lancamentos.filter((l) => l.status === 'A_PAGAR').slice(0, 3);

  const fechar = async () => {
    if (!(await confirmar(`Fechar ${ym}? Os aportes serão calculados e o mês fica somente leitura.`, 'Fechar mês'))) return;
    try { await api('POST', `/api/meses/${ym}/fechar`, {}); }
    catch (e) {
      if (e.dados && e.dados.diferenca_centavos !== undefined) {
        if (!(await confirmar(`${e.message} Diferença: R$ ${moeda(e.dados.diferenca_centavos)}.`, 'Fechar assim mesmo'))) return;
        await api('POST', `/api/meses/${ym}/fechar`, { confirmar_diferenca: true });
      } else { return toast(e.message); }
    }
    toast('Mês fechado'); window.dispatchEvent(new Event('hashchange'));
  };

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Painel'), seletorMes(estado, meses, ym)),
    h('div', { class: 'card' },
      h('div', { class: 'suave' }, v.status === 'FECHADO' ? 'Mês fechado' : 'Mês aberto · aportes provisórios'),
      h('div', { class: 'suave' }, 'Saldo ao fim do mês'),
      h('div', { class: `grande ${corSaldo(v.totais.saldo_final)}` }, `R$ ${moeda(v.totais.saldo_final)}`),
      h('div', { class: 'suave' }, `Saldo do banco no início: R$ ${moeda(v.saldo_inicial_centavos)}`)),
    h('div', { class: 'grade' },
      h('div', { class: 'card' }, h('div', { class: 'suave' }, 'Débitos'), h('b', {}, moeda(v.totais.debitos))),
      h('div', { class: 'card' }, h('div', { class: 'suave' }, 'Aportes'), h('b', {}, moeda(v.totais.aportes)))),
    v.status === 'FECHADO' ? h('div', { class: 'card' },
      h('div', { class: 'suave' }, 'Aportes recebidos'),
      h('div', { class: 'barra' }, h('b', { style: `width:${v.totais.aportes ? Math.round(recebido * 100 / v.totais.aportes) : 0}%` })),
      h('div', { class: 'suave' }, `${pagos} de ${v.aportes.length} sócios · ${moeda(recebido)} de ${moeda(v.totais.aportes)}`)) : null,
    h('div', { class: 'card' }, h('div', { class: 'suave' }, 'Próximos vencimentos'),
      proximos.length ? proximos.map((l) => h('div', { class: 'linha' },
        h('span', {}, rotuloLancamento(l), h('br'), h('span', { class: 'suave' }, `${dm(l.vencimento)} · ${l.forma}`)),
        h('span', {}, moeda(l.valor_centavos)))) : h('p', { class: 'suave' }, 'Nada a pagar.')),
    admin && v.status === 'ABERTO' ? h('button', { class: 'largo', onclick: fechar }, 'Fechar mês') : null);
}
```
- [ ] **Step 3: `lancamentos.mjs`** (Tela 2; toque na linha edita, ADMIN)

```js
import { h, moeda } from '../ui.mjs';
import { api } from '../api.mjs';
import { escolherYm, seletorMes, rotuloLancamento } from './seletor-mes.mjs';

const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ROTULO = { A_PAGAR: ['a pagar', 'aviso'], PAGO: ['pago', 'ok'], A_RECEBER: ['a receber', 'aviso'], RECEBIDO: ['recebido', 'ok'] };

export async function render(estado) {
  const meses = await api('GET', '/api/meses');
  const ym = escolherYm(estado, meses);
  if (!ym) return h('div', { class: 'card' }, 'Nenhum mês aberto ainda.');
  const v = await api('GET', `/api/meses/${ym}`);
  const admin = estado.user.perfil === 'ADMIN' && v.status === 'ABERTO';
  let filtro = 'TODOS';
  const lista = h('div', { class: 'card' });

  const linhaSaldo = (rotulo, sub, valorTxt, saldo, onclick) => h('div', { class: 'linha', onclick, style: onclick ? 'cursor:pointer' : '' },
    h('span', {}, rotulo, h('br'), h('span', { class: 'suave' }, sub)),
    h('span', { style: 'text-align:right' }, valorTxt, h('br'), h('span', { class: `suave ${saldo < 0 ? 'neg' : ''}` }, `saldo ${moeda(saldo)}`)));

  const desenhar = () => {
    const itens = [
      h('div', { class: 'linha' }, h('span', {}, 'Saldo banco', h('br'), h('span', { class: 'suave' }, 'saldo inicial')),
        h('span', { class: v.saldo_inicial_centavos < 0 ? 'neg' : '' }, moeda(v.saldo_inicial_centavos))),
      ...v.lancamentos.filter((l) => filtro === 'TODOS' || l.tipo === filtro).map((l) => {
        const [txt, cls] = ROTULO[l.status];
        return linhaSaldo(rotuloLancamento(l),
          [dm(l.vencimento), ' · ', l.forma, ' ', h('span', { class: `tag ${cls}` }, txt)],
          (l.tipo === 'CREDITO' ? '+' : '') + moeda(l.valor_centavos), l.saldo_centavos,
          admin ? () => { location.hash = `#/lancamento/${l.id}`; } : null);
      }),
      ...(filtro !== 'DEBITO' ? v.aportes.map((a) => linhaSaldo(`Aporte ${a.nome} (${a.bp / 100}%)`,
        [dm(a.vencimento), ' · PIX ', h('span', { class: `tag ${a.status === 'PAGO' ? 'ok' : 'aviso'}` }, v.provisorio ? 'provisório' : (a.status === 'PAGO' ? 'recebido' : 'a receber'))],
        `+${moeda(a.final_centavos)}`, a.saldo_centavos, null)) : []),
    ];
    lista.replaceChildren(...itens);
  };
  const chip = (rotulo, valor) => h('span', { class: 'chip', onclick: (ev) => {
    filtro = valor;
    ev.target.parentNode.querySelectorAll('.chip').forEach((c) => c.classList.remove('sel'));
    ev.target.classList.add('sel'); desenhar();
  } }, rotulo);
  const chips = h('div', { class: 'chips' }, chip('Todos', 'TODOS'), chip('Débitos', 'DEBITO'), chip('Créditos', 'CREDITO'));
  chips.firstChild.classList.add('sel');
  desenhar();

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Lançamentos'), seletorMes(estado, meses, ym)),
    chips, h('div', { style: 'height:10px' }), lista,
    admin ? h('button', { class: 'fab', 'aria-label': 'Novo lançamento', onclick: () => { location.hash = `#/lancamento/novo?ym=${ym}`; } }, '+') : null);
}
```
- [ ] **Step 4: `lancamento-form.mjs`** (Tela 3). Rota `#/lancamento/novo?ym=AAAA-MM` ou `#/lancamento/<id>`.

```js
import { h, toast, confirmar } from '../ui.mjs';
import { api } from '../api.mjs';
import { parseBRL, formatBRL } from '../money.mjs';

export async function render(estado) {
  const arg = estado.arg || 'novo';
  const novo = arg.startsWith('novo');
  const ym = novo ? new URLSearchParams(arg.split('?')[1]).get('ym') : null;
  let l = { tipo: 'DEBITO', descritivo: '', valor_centavos: 0, vencimento: `${ym || estado.ym}-15`, forma: 'BOLETO', recorrencia: 'NENHUMA', parcela_atual: null, parcela_total: null, status: 'A_PAGAR' };
  if (!novo) {
    const meses = await api('GET', '/api/meses');
    for (const m of meses) {
      const v = await api('GET', `/api/meses/${m.ym}`);
      const achou = v.lancamentos.find((x) => String(x.id) === arg);
      if (achou) { l = achou; break; }
    }
  }
  const tipo = h('select', {}, h('option', { value: 'DEBITO', selected: l.tipo === 'DEBITO' }, 'Débito'), h('option', { value: 'CREDITO', selected: l.tipo === 'CREDITO' }, 'Crédito'));
  const desc = h('input', { value: l.descritivo, maxlength: 80 });
  const valor = h('input', { inputmode: 'decimal', value: l.valor_centavos ? formatBRL(l.valor_centavos) : '' });
  const venc = h('input', { type: 'date', value: l.vencimento });
  const forma = h('select', {}, ['BOLETO', 'GUIA', 'PIX', 'OUTRO'].map((f) => h('option', { value: f, selected: l.forma === f }, f)));
  const rec = h('select', {}, [['NENHUMA', 'Só este mês'], ['FIXO', 'Fixo (repete todo mês)'], ['PARCELADO', 'Parcelado']].map(([v, t]) => h('option', { value: v, selected: l.recorrencia === v }, t)));
  const pa = h('input', { type: 'number', min: 1, value: l.parcela_atual || '' });
  const pt = h('input', { type: 'number', min: 1, value: l.parcela_total || '' });
  const blocoParcela = h('div', { class: 'grade' }, h('div', {}, h('label', {}, 'Parcela atual'), pa), h('div', {}, h('label', {}, 'Total de parcelas'), pt));
  const sit = h('select', {}, [['A_PAGAR', 'A pagar'], ['PAGO', 'Pago'], ['A_RECEBER', 'A receber'], ['RECEBIDO', 'Recebido']].map(([v, t]) => h('option', { value: v, selected: l.status === v }, t)));
  const ajustar = () => { blocoParcela.hidden = rec.value !== 'PARCELADO'; };
  rec.addEventListener('change', ajustar); ajustar();

  const salvar = async () => {
    const c = parseBRL(valor.value);
    if (c === null || c < 0) return toast('Informe um valor válido, como 1.234,56');
    const corpo = { tipo: tipo.value, descritivo: desc.value, valor_centavos: c, vencimento: venc.value, forma: forma.value, recorrencia: rec.value,
      parcela_atual: rec.value === 'PARCELADO' ? Number(pa.value) : null, parcela_total: rec.value === 'PARCELADO' ? Number(pt.value) : null, status: sit.value };
    try {
      if (novo) await api('POST', `/api/meses/${ym}/lancamentos`, { ...corpo, status: tipo.value === 'DEBITO' ? 'A_PAGAR' : 'A_RECEBER' });
      else await api('PUT', `/api/lancamentos/${arg}`, corpo);
      toast('Lançamento salvo'); location.hash = '#/lancamentos';
    } catch (e) { toast(e.message); }
  };
  const excluir = async () => {
    if (!(await confirmar('Excluir este lançamento?', 'Excluir'))) return;
    try { await api('DELETE', `/api/lancamentos/${arg}`); location.hash = '#/lancamentos'; } catch (e) { toast(e.message); }
  };

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, novo ? 'Novo lançamento' : 'Editar lançamento'), h('a', { href: '#/lancamentos' }, 'Cancelar')),
    h('div', { class: 'card' },
      h('label', {}, 'Tipo'), tipo, h('label', {}, 'Descritivo'), desc, h('label', {}, 'Valor (R$)'), valor,
      h('label', {}, 'Vencimento'), venc, h('label', {}, 'Forma de pagamento'), forma,
      h('label', {}, 'Repetição'), rec, blocoParcela,
      novo ? null : [h('label', {}, 'Situação'), sit]),
    h('button', { class: 'largo', onclick: salvar }, 'Salvar lançamento'),
    novo ? null : h('button', { class: 'largo perigo', style: 'margin-top:10px', onclick: excluir }, 'Excluir'));
}
```
- [ ] **Step 5: Verificação no navegador** (preview): logar como ADMIN; abrir o mês (Task 15 traz a tela; até lá use `node scripts/seed-outubro.js` contra o banco de dev); conferir Painel (saldo −5.523,73 antes dos aportes… no painel o saldo final provisório é 0,00), Lançamentos (saldos corridos de cada linha iguais aos da planilha: −283,23 / −3.666,27 / −5.221,48 / −5.523,73), criar/editar/excluir lançamento. Em 375 px de largura, sem rolagem horizontal. **Commit:** `git add -A && git commit -m "feat: telas Painel, Lançamentos e formulário"`

---

### Task 15: Telas Aportes e Meses

**Files:**
- Create: `public/js/telas/aportes.mjs`, `public/js/telas/meses.mjs`

- [ ] **Step 1: `aportes.mjs`** (Tela 4)

```js
import { h, moeda, toast, confirmar } from '../ui.mjs';
import { api } from '../api.mjs';
import { parseBRL, formatBRL } from '../money.mjs';
import { textoCobranca } from '../cobranca.mjs';
import { escolherYm, seletorMes } from './seletor-mes.mjs';

const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function render(estado) {
  const meses = await api('GET', '/api/meses');
  const ym = escolherYm(estado, meses);
  if (!ym) return h('div', { class: 'card' }, 'Nenhum mês aberto ainda.');
  const v = await api('GET', `/api/meses/${ym}`);
  const admin = estado.user.perfil === 'ADMIN';
  const recarregar = () => window.dispatchEvent(new Event('hashchange'));

  const alternarPago = async (a) => {
    try { await api('PUT', `/api/meses/${ym}/aportes/${a.socio_id}`, { status: a.status === 'PAGO' ? 'PENDENTE' : 'PAGO' }); recarregar(); }
    catch (e) { toast(e.message); }
  };
  const editarAjuste = async (a) => {
    const valor = h('input', { inputmode: 'decimal', value: a.ajuste_centavos ? formatBRL(a.ajuste_centavos) : '', placeholder: '-302,25' });
    const motivo = h('input', { value: a.ajuste_motivo || '', placeholder: 'Acerto de setembro entre Lígia e Henrique' });
    const origem = h('input', { type: 'month', value: a.ajuste_origem || '' });
    const d = h('dialog', {}, h('h3', {}, `Acerto de ${a.nome}`),
      h('label', {}, 'Valor do acerto (R$, negativo reduz o aporte)'), valor, h('label', {}, 'Motivo'), motivo, h('label', {}, 'Mês de origem'), origem,
      h('div', { class: 'acoes' }, h('button', { class: 'sec', onclick: () => d.close() }, 'Cancelar'),
        h('button', { onclick: async () => {
          const c = valor.value.trim() ? parseBRL(valor.value) : 0;
          if (c === null) return toast('Informe um valor válido');
          try { await api('PUT', `/api/meses/${ym}/aportes/${a.socio_id}`, { ajuste_centavos: c, ajuste_motivo: motivo.value, ajuste_origem: origem.value }); d.close(); recarregar(); }
          catch (e) { toast(e.message); }
        } }, 'Salvar')));
    d.addEventListener('close', () => d.remove());
    document.body.append(d); d.showModal();
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoCobranca(v, ym)); toast('Texto copiado'); }
    catch { toast('Não foi possível copiar'); }
  };

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Aportes'), seletorMes(estado, meses, ym)),
    h('div', { class: 'card' }, h('div', { class: 'suave' }, v.provisorio ? 'Total a aportar (provisório)' : 'Total a aportar'),
      h('div', { class: 'grande' }, moeda(v.totais.aportes)),
      v.totais.diferenca !== 0 ? h('div', { class: 'suave neg' }, `Diferença para o valor a cobrir: ${moeda(v.totais.diferenca)}`) : null),
    h('div', { class: 'card' }, v.aportes.length ? v.aportes.map((a) => h('div', { class: 'linha' },
      h('span', {}, `${a.nome} · ${a.bp / 100}%`, h('br'), h('span', { class: 'suave' }, `vence ${dm(a.vencimento)}`),
        a.ajuste_centavos ? h('br') : null,
        a.ajuste_centavos ? h('span', { class: 'suave' }, `acerto ${moeda(a.ajuste_centavos)}: ${a.ajuste_motivo}`) : null),
      h('span', { style: 'text-align:right' }, moeda(a.final_centavos), h('br'),
        v.provisorio ? h('span', { class: 'tag' }, 'provisório')
          : h('span', { class: `tag ${a.status === 'PAGO' ? 'ok' : 'aviso'}`, style: admin ? 'cursor:pointer' : '', onclick: admin ? () => alternarPago(a) : null }, a.status === 'PAGO' ? 'pago' : 'pendente'),
        admin && v.status === 'ABERTO' ? [h('br'), h('a', { href: '#/aportes', onclick: (ev) => { ev.preventDefault(); editarAjuste(a); } }, 'acerto')] : null)))
      : h('p', { class: 'suave' }, 'Defina os percentuais dos sócios em Mais → Sócios.')),
    h('button', { class: 'largo', onclick: copiar }, 'Copiar cobrança para o WhatsApp'));
}
```
- [ ] **Step 2: `meses.mjs`** (Tela 5; ADMIN abre mês e reabre o mais recente; link para Exportar)

```js
import { h, moeda, toast, confirmar } from '../ui.mjs';
import { api } from '../api.mjs';
import { parseBRL } from '../money.mjs';
import { nomeDoMes } from '../cobranca.mjs';

function proximoYm(ym) {
  const [a, m] = ym.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

export async function render(estado) {
  const meses = await api('GET', '/api/meses');
  const admin = estado.user.perfil === 'ADMIN';
  const recarregar = () => window.dispatchEvent(new Event('hashchange'));

  const abrir = async () => {
    const primeiro = meses.length === 0;
    const alvo = primeiro ? new Date().toISOString().slice(0, 7) : proximoYm(meses[0].ym);
    let corpo = { ym: alvo };
    if (primeiro) {
      const txt = prompt(`Saldo do banco em 01/${alvo.slice(5)}/${alvo.slice(0, 4)} (R$, negativo se devedor):`, '0,00');
      const c = txt === null ? null : parseBRL(txt);
      if (c === null) return;
      corpo.saldo_inicial_centavos = c;
    } else if (!(await confirmar(`Abrir ${nomeDoMes(alvo)}? Os lançamentos fixos e parcelados serão copiados.`, 'Abrir mês'))) return;
    try { await api('POST', '/api/meses/abrir', corpo); estado.guardarYm(alvo); recarregar(); }
    catch (e) { toast(e.message); }
  };
  const reabrir = async (ym) => {
    if (!(await confirmar(`Reabrir ${nomeDoMes(ym)}? Os aportes voltam a ser provisórios.`, 'Reabrir'))) return;
    try { await api('POST', `/api/meses/${ym}/reabrir`, {}); recarregar(); } catch (e) { toast(e.message); }
  };

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Meses'), admin ? h('button', { onclick: abrir }, meses.length ? `Abrir ${nomeDoMes(proximoYm(meses[0].ym))}` : 'Abrir mês') : null),
    h('div', { class: 'card' }, meses.length ? meses.map((m, i) => h('div', { class: 'linha' },
      h('span', {}, h('a', { href: '#/painel', onclick: () => estado.guardarYm(m.ym) }, nomeDoMes(m.ym)), h('br'), h('span', { class: 'suave' }, `débitos ${moeda(m.debitos)}`)),
      h('span', {}, h('span', { class: `tag ${m.status === 'FECHADO' ? 'ok' : 'aviso'}` }, m.status === 'FECHADO' ? 'fechado' : 'aberto'), ' ',
        h('a', { href: '#/exportar', onclick: () => estado.guardarYm(m.ym) }, 'exportar'),
        admin && i === 0 && m.status === 'FECHADO' ? [' ', h('a', { href: '#/meses', onclick: (ev) => { ev.preventDefault(); reabrir(m.ym); } }, 'reabrir')] : null)))
      : h('p', { class: 'suave' }, 'Nenhum mês ainda.')),
    h('p', { class: 'suave' }, 'Ao abrir um mês, o app copia os lançamentos fixos e parcelados (avançando a parcela) e leva o saldo final como saldo inicial.'));
}
```
(O `prompt()` nativo é aceito para o saldo do **primeiro** mês, ação única; os demais fluxos usam `confirmar`.)

- [ ] **Step 3: Verificação:** abrir `#/aportes`: Adriano 1.380,93 · Henrique 1.657,12 · Lígia 1.380,93 · Luiz 1.104,75 (provisório); lançar acerto na Lígia −302,25 com motivo/origem e ver a diferença; fechar no Painel confirmando a diferença; marcar "pago"; "Copiar cobrança". **Commit:** `git add -A && git commit -m "feat: telas Aportes e Meses"`

---

### Task 16: Telas Sócios e Usuários (ADMIN)

**Files:**
- Create: `public/js/telas/socios.mjs`, `public/js/telas/usuarios.mjs`

- [ ] **Step 1: `socios.mjs`** (Tela 6)

```js
import { h, toast, confirmar } from '../ui.mjs';
import { api } from '../api.mjs';
import { nomeDoMes } from '../cobranca.mjs';

const pct = (bp) => `${(bp / 100).toString().replace('.', ',')}%`;

export async function render(estado) {
  const socios = await api('GET', '/api/socios');
  const usuarios = await api('GET', '/api/usuarios');
  const ativos = socios.filter((s) => s.ativo);
  const soma = ativos.reduce((s, x) => s + x.bp_atual, 0);
  const recarregar = () => window.dispatchEvent(new Event('hashchange'));

  const dialogo = (titulo, campos, aoSalvar) => {
    const d = h('dialog', {}, h('h3', {}, titulo), ...campos,
      h('div', { class: 'acoes' }, h('button', { class: 'sec', onclick: () => d.close() }, 'Cancelar'),
        h('button', { onclick: async () => { try { await aoSalvar(); d.close(); recarregar(); } catch (e) { toast(e.message); } } }, 'Salvar')));
    d.addEventListener('close', () => d.remove());
    document.body.append(d); d.showModal();
  };

  const novoSocio = () => {
    const nome = h('input', { maxlength: 60 });
    const usu = h('select', {}, h('option', { value: '' }, '(sem acesso ao app)'), usuarios.filter((u) => u.ativo).map((u) => h('option', { value: u.id }, u.nome)));
    dialogo('Novo sócio', [h('label', {}, 'Nome'), nome, h('label', {}, 'Usuário vinculado'), usu],
      () => api('POST', '/api/socios', { nome: nome.value, usuario_id: usu.value ? Number(usu.value) : null }));
  };
  const editarSocio = (s) => {
    const nome = h('input', { value: s.nome });
    const usu = h('select', {}, h('option', { value: '' }, '(sem acesso ao app)'), usuarios.filter((u) => u.ativo).map((u) => h('option', { value: u.id, selected: u.id === s.usuario_id }, u.nome)));
    dialogo(`Editar ${s.nome}`, [h('label', {}, 'Nome'), nome, h('label', {}, 'Usuário vinculado'), usu],
      () => api('PUT', `/api/socios/${s.id}`, { nome: nome.value, usuario_id: usu.value ? Number(usu.value) : null }));
  };
  const excluir = async (s) => {
    if (!(await confirmar(`Excluir ${s.nome}? Se houver histórico, ele será apenas inativado.`, 'Excluir'))) return;
    try { const r = await api('DELETE', `/api/socios/${s.id}`); toast(r.inativado ? 'Sócio inativado (tem histórico)' : 'Sócio excluído'); recarregar(); }
    catch (e) { toast(e.message); }
  };
  const alterarPercentuais = () => {
    const mes = h('input', { type: 'month', value: new Date().toISOString().slice(0, 7) });
    const campos = ativos.map((s) => ({ s, el: h('input', { inputmode: 'decimal', value: String(s.bp_atual / 100).replace('.', ',') }) }));
    const total = h('p', { class: 'suave' }, '');
    const atualiza = () => {
      const t = campos.reduce((a, c) => a + Math.round(parseFloat(c.el.value.replace(',', '.') || '0') * 100), 0);
      total.textContent = `Soma: ${pct(t)}${t === 10000 ? '' : ' (precisa ser 100%)'}`;
    };
    campos.forEach((c) => c.el.addEventListener('input', atualiza)); atualiza();
    dialogo('Alterar percentuais', [h('label', {}, 'Vale a partir de'), mes,
      ...campos.flatMap((c) => [h('label', {}, c.s.nome), c.el]), total],
    () => api('POST', '/api/percentuais', { vigente_desde: mes.value, itens: campos.map((c) => ({ socio_id: c.s.id, bp: Math.round(parseFloat(c.el.value.replace(',', '.') || '0') * 100) })) }));
  };

  return h('div', {},
    h('div', { class: 'topo' }, h('h1', {}, 'Sócios'), h('a', { href: '#/mais' }, 'Voltar')),
    h('div', { class: 'card' }, ativos.map((s) => h('div', { class: 'linha' },
      h('span', {}, s.nome, h('br'), h('span', { class: 'suave' }, s.historico.map((x) => `${nomeDoMes(x.vigente_desde)}: ${pct(x.bp)}`).join(' → '))),
      h('span', {}, pct(s.bp_atual), ' ', h('a', { href: '#/socios', onclick: (e) => { e.preventDefault(); editarSocio(s); } }, 'editar'),
        ' ', h('a', { href: '#/socios', onclick: (e) => { e.preventDefault(); excluir(s); } }, 'excluir')))),
    h('div', { class: 'linha' }, h('b', {}, 'Total'), h('b', { class: soma === 10000 ? 'pos' : 'neg' }, pct(soma)))),
    h('div', { class: 'acoes' }, h('button', { class: 'sec', onclick: novoSocio }, 'Novo sócio'), h('button', { onclick: alterarPercentuais }, 'Alterar percentuais')),
    socios.some((s) => !s.ativo) ? h('p', { class: 'suave' }, `Inativos: ${socios.filter((s) => !s.ativo).map((s) => s.nome).join(', ')}`) : null);
}
```
Observação de fluxo (sócio novo): criar o sócio e, em seguida, "Alterar percentuais" para incluí-lo (o servidor exige todos os ativos somando 100%). Sócio que sai: "Alterar percentuais" com 0% para ele a partir do mês, depois "excluir" (inativa).

- [ ] **Step 2: `usuarios.mjs`** (Tela 7)

```js
import { h, toast, confirmar } from '../ui.mjs';
import { api } from '../api.mjs';

export async function render(estado) {
  const lista = await api('GET', '/api/usuarios');
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
```
- [ ] **Step 3: Verificação:** criar um usuário SOCIO e vinculá-lo a um sócio; entrar com ele (janela anônima) e ver que não há botão "Mais", "+", "Fechar mês" nem links de edição, e que `fetch('/api/usuarios')` devolve 403. Alterar percentuais para 2026-12 e ver o histórico `out/26: 25% → dez/26: 25%`. **Commit:** `git add -A && git commit -m "feat: telas Sócios e Usuários"`

---

### Task 17: Exportar (PDF) e conferência final com outubro/26

**Files:**
- Create: `public/js/telas/exportar.mjs`

- [ ] **Step 1: `exportar.mjs`** — folha no formato da planilha; "Exportar PDF" chama `window.print()` (o usuário escolhe "Salvar como PDF"; CSS `@media print` já esconde a navegação).

```js
import { h, moeda } from '../ui.mjs';
import { api } from '../api.mjs';
import { nomeDoMes } from '../cobranca.mjs';
import { escolherYm } from './seletor-mes.mjs';
import { rotuloLancamento } from './seletor-mes.mjs';

const data = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export async function render(estado) {
  const meses = await api('GET', '/api/meses');
  const ym = escolherYm(estado, meses);
  if (!ym) return h('div', { class: 'card' }, 'Nenhum mês aberto ainda.');
  const v = await api('GET', `/api/meses/${ym}`);
  const td = (t, cls) => h('td', { class: cls || '', style: 'border:1px solid #999;padding:4px 6px' }, t);
  const linha = (desc, venc, cred, deb, saldo, pg) => h('tr', {}, td(desc), td(venc), td(cred, ''), td(deb, ''), td(saldo, saldo.startsWith('-') ? 'neg' : ''), td(pg));
  const corpo = [
    linha('SALDO BANCO', data(`${ym}-01`), '', v.saldo_inicial_centavos < 0 ? moeda(-v.saldo_inicial_centavos) : '', moeda(v.saldo_inicial_centavos), ''),
    ...v.lancamentos.map((l) => linha(rotuloLancamento(l), data(l.vencimento), l.tipo === 'CREDITO' ? moeda(l.valor_centavos) : '', l.tipo === 'DEBITO' ? moeda(l.valor_centavos) : '', moeda(l.saldo_centavos), l.forma)),
    ...v.aportes.map((a) => linha(`Aporte ${a.nome} (${a.bp / 100}%)`, data(a.vencimento), moeda(a.final_centavos), '', moeda(a.saldo_centavos), 'PIX')),
  ];
  return h('div', {},
    h('div', { class: 'topo nao-imprime' }, h('h1', {}, 'Exportar'), h('a', { href: '#/meses' }, 'Voltar')),
    h('h2', { style: 'text-align:center' }, `ACERTOS PATRONI - ${nomeDoMes(ym).toUpperCase()}`),
    h('table', { style: 'border-collapse:collapse;width:100%;font-size:13px' },
      h('thead', {}, h('tr', {}, ['Descritivo', 'Vencimento', 'Crédito (R$)', 'Débito (R$)', 'SALDO (R$)', 'PGTO'].map((t) => h('th', { style: 'border:1px solid #999;padding:4px 6px;background:#dbe5f1' }, t)))),
      h('tbody', {}, corpo)),
    v.provisorio ? h('p', { class: 'suave' }, 'Mês aberto: aportes provisórios.') : null,
    h('button', { class: 'largo nao-imprime', style: 'margin-top:12px', onclick: () => window.print() }, 'Exportar PDF'));
}
```
- [ ] **Step 2: Conferência com a planilha** (banco de **dev/preview**, não produção): `node --use-system-ca scripts/seed-outubro.js`; no app, mês 2026-10 deve mostrar exatamente: débitos 5.507,50; saldo após cada linha −283,23 / −3.666,27 / −5.221,48 / −5.523,73; aportes provisórios 1.380,93 / 1.657,12 / 1.380,93 / 1.104,75 (soma 5.523,73); saldo final 0,00. Lançar na Lígia o acerto −302,25 e no Henrique o acerto +16,22 e conferir a diferença exibida; fechar confirmando a diferença; "Exportar PDF" gera uma folha equivalente à planilha. (Os valores da planilha real divergem do percentual puro pelo acerto de setembro entre Lígia e Henrique, conforme a decisão do spec §8; o ajuste exato real é lançado pelo Gilmar.)
- [ ] **Step 3: Teste em celular real:** abrir a URL no Android/iPhone, "Adicionar à tela inicial", abrir em tela cheia; ativar modo avião e abrir o mês já visitado (leitura offline funciona); com a conexão, tentar lançar → erro amigável na ausência de rede.
- [ ] **Step 4: Suíte completa e deploy**

```bash
npm test
vercel deploy --prod
```
Expected: todos os testes PASS; deploy `Ready`; conferir `https://<dominio>/api/me` → 401 e a tela de login carrega. **Commit:** `git add -A && git commit -m "feat: exportar PDF e conferência de outubro/26"`

---

## Auto-revisão contra o spec

| Requisito do spec | Onde |
|---|---|
| §2 perfis ADMIN/SOCIO, escrita só ADMIN no servidor | Task 6 (router), 7–11 (`role: 'ADMIN'`), 13 (nav) |
| §3 modelo de dados | Task 6 `001_init.sql` |
| §4.1 saldo corrido | Task 4 `saldoCorrido`, Task 5 |
| §4.2 abrir mês, parcelas, dia 31 | Task 3, Task 10 |
| §4.3 aporte = percentual × valor a cobrir | Task 4 `valorACobrir`/`calcularAportes` |
| §4.4 cálculo no fechamento, estimativa provisória | Task 5 (`provisorio`), Task 11 |
| §4.5 acerto entre sócios com motivo e mês de origem; diferença confirmada | Task 11, Task 15 |
| §4.6 fechar/reabrir, congela | Task 11 |
| §4.7 sócios: cadastrar/editar/excluir, vigência, soma 100%, inativar com histórico | Task 9, Task 16 |
| §4.8 usuários, último ADMIN | Task 8, Task 16 |
| §5 telas 1–7 | Tasks 14, 15, 16 |
| §6 PWA, offline de leitura, exportar PDF, cobrança WhatsApp | Task 13 (sw), 2 (cobrança), 15, 17 |
| §7 testes | Tasks 2–11 + conferência da Task 17 |

Percentuais iniciais (Adriano 25, Henrique 30, Lígia 25, Luiz 20) entram pelo seed (Task 12); qualquer mudança posterior é feita no app (Task 16).
