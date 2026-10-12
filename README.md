# Acertos Patroni

Aplicativo (PWA) de acertos financeiros mensais entre os sócios da Patroni: lançamentos de débitos e créditos do mês, saldo corrido, cálculo dos aportes de cada sócio pelo percentual vigente e acompanhamento de quem já pagou.

Node.js com funções na Vercel (`api/index.js`, rotas em `routes/`), banco PostgreSQL (Neon) acessado pelo pacote `pg` e telas em `public/` (JavaScript sem framework). Somente o perfil ADMIN escreve; o perfil SOCIO consulta.

## Requisitos

- Node.js 22.15 ou mais novo (os scripts de banco usam `--use-system-ca` e `--env-file-if-exists`).
- `npm install`

## Testes

```
npm test
```

Executa `node --test "test/**/*.test.js"`. Os testes usam um banco PostgreSQL em memória (pg-mem); não precisam de internet nem de variáveis de ambiente.

## Rodar localmente

```
npm run dev:local
```

Sobe um servidor local com banco em memória, escutando só em 127.0.0.1. As credenciais de teste são geradas a cada partida e gravadas em `.env.dev-local` (arquivo ignorado pelo Git). Os dados somem ao parar o servidor.

## Publicar na Vercel

1. Crie o projeto na Vercel apontando para este repositório.
2. No projeto, abra Storage, escolha Neon pelo Marketplace e crie o banco. Use a URL de conexão com pooler.
3. Em Settings, Environment Variables, cadastre:
   - `DATABASE_URL`: a URL do Neon (com pooler);
   - `SESSION_SECRET`: texto ASCII com pelo menos 32 bytes. Cadastre só no painel da Vercel; não grave em arquivo versionado.
4. Baixe as variáveis para o ambiente local: `vercel env pull .env.local`. O arquivo `.env.local` é ignorado pelo Git; os scripts `migrate`, `seed` e `seed:outubro` o leem sozinhos (`--env-file-if-exists=.env.local`), então `DATABASE_URL` não precisa ser exportada à mão.
5. Crie as tabelas: `npm run migrate`.
6. Crie o primeiro administrador, com a senha escolhida pelo dono (mínimo de 8 caracteres). No PowerShell:

   ```powershell
   $env:ADMIN_EMAIL = "dono@exemplo.com"; $env:ADMIN_PASSWORD = "sua-senha"; npm run seed
   ```

   No Git Bash ou Linux:

   ```bash
   ADMIN_EMAIL=dono@exemplo.com ADMIN_PASSWORD=sua-senha npm run seed
   ```

   O seed também cadastra os quatro sócios com os percentuais iniciais (Adriano 25%, Henrique 30%, Lígia 25%, Luiz 20%, a partir de 2026-10). Depois, qualquer mudança de percentual é feita pelo app.
7. Publique: `vercel deploy --prod`.

`npm run seed:outubro` carrega os dados de outubro/2026 e serve só para conferência em um banco de teste. Não rode no banco de produção.

Observação: o primeiro mês sugerido pelo app usa o mês em UTC. Perto do fim do mês (depois de 21h no horário de Brasília do dia 31) ele já pode sugerir o mês seguinte. Abra outubro antes disso ou use o seed.

## Documentação

Especificação e plano: `docs/superpowers/specs/` e `docs/superpowers/plans/`.
