# Acertos Patroni

Aplicativo para acertos de contas entre o patrono e os envolvidos, com registro de lançamentos, cálculo dos saldos e acompanhamento do que ainda está em aberto.

O app roda na Vercel: as funções ficam em `api/` e as rotas são direcionadas para `api/index.js` pelo `vercel.json`. O banco é PostgreSQL, acessado pelo pacote `pg`.

Testes: `npm test` (executa `node --test test/`).

Especificação e plano: `docs/superpowers/specs/` e `docs/superpowers/plans/`.
