# Acertos Patroni — PWA de acertos financeiros mensais (design)

Rascunho em 2026-10-12. **Este app vai para repositório e projeto Vercel próprios**, separados do condo-app. Este arquivo está aqui só para revisão e deve ser movido para `docs/` do novo repositório.

## 1. Objetivo

Substituir a planilha "ACERTOS PATRONI – mês/ano". Todo início de mês o administrador lança as despesas; o app calcula o saldo corrido e o aporte de cada sócio. Os sócios consultam pelo celular, sem executar ação.

## 2. Perfis

| Perfil | Pode |
|---|---|
| ADMIN | tudo: lançamentos, meses, sócios, usuários, fechamento |
| SOCIO | somente ver: painel, lançamentos, aportes, meses fechados |

Um sócio é um usuário com perfil SOCIO. O ADMIN pode ou não ser sócio (um mesmo usuário pode ter os dois papéis).

## 3. Modelo de dados

- `usuario` — id, nome, e-mail, senha (hash), perfil, ativo.
- `socio` — id, usuario_id, nome, ativo.
- `socio_percentual` — socio_id, vigente_desde (mês), percentual. Histórico: mudar o percentual cria uma linha nova válida a partir de um mês. Percentuais vigentes de um mês devem somar 100%.
- `mes` — id, ano, mes, status (ABERTO | FECHADO), saldo_inicial_centavos.
- `lancamento` — id, mes_id, tipo (DEBITO | CREDITO), descritivo, valor_centavos, vencimento, forma (BOLETO | GUIA | PIX | OUTRO), status (A_PAGAR | PAGO | A_RECEBER | RECEBIDO), ordem, recorrencia (FIXO | PARCELADO | NENHUMA), parcela_atual, parcela_total.
- `aporte` — mes_id, socio_id, percentual_aplicado, valor_base_centavos, ajuste_centavos, ajuste_motivo, valor_final_centavos, status (PENDENTE | PAGO).
- Valores sempre em centavos inteiros.

## 4. Regras

1. **Saldo corrido**: saldo da linha = saldo anterior − débito + crédito, na ordem das linhas. A primeira linha é o saldo inicial do mês (o saldo final do mês anterior, editável pelo ADMIN para refletir o saldo real do banco).
2. **Abrir mês**: copia os lançamentos FIXO e PARCELADO do mês anterior; PARCELADO avança a parcela (ICMS 17/119 → 18/119) e some ao passar da última; vencimento mantém o dia no novo mês (dia 31 cai no último dia do mês). Aportes não são copiados: são gerados no fechamento.
3. **Aporte do sócio** = percentual vigente × valor a cobrir do mês + ajuste manual. O valor a cobrir é o total de débitos do mês mais o saldo inicial negativo. Se o saldo inicial for positivo, ele abate o valor a cobrir.
4. O cálculo dos aportes é feito no **fechamento do mês**, quando não há mais despesas a incluir. Antes disso o painel mostra uma estimativa marcada como "provisória".
5. **Acerto entre sócios** (campo `ajuste` do aporte): o rateio é sempre o percentual de cada um. Quando sócios acertam entre si valores de um mês anterior, o ADMIN lança o acerto no aporte do mês em que ele é liquidado, positivo ou negativo, com motivo e mês de origem obrigatórios (ex.: "acerto de setembro entre Lígia e Henrique"). O app mostra a diferença entre a soma dos aportes finais e o valor a cobrir; se houver diferença, o ADMIN confirma explicitamente para fechar.
6. **Fechar mês** congela lançamentos, percentuais aplicados e aportes (somente leitura). Reabrir é possível só pelo ADMIN e só enquanto o mês seguinte não existir.
7. **Sócios**: cadastrar, editar, excluir. Mudar o percentual ou incluir/retirar sócio vale a partir de um mês escolhido e **nunca altera meses fechados**. Excluir um sócio com histórico apenas o inativa (some das listas novas, permanece nos meses antigos); sem histórico, apaga de verdade. O app não deixa salvar percentuais que não somem 100%.
8. **Usuários**: cadastrar, editar, redefinir senha, inativar/excluir. Não é possível excluir ou rebaixar o último ADMIN.

## 5. Telas (aprovadas)

1. Painel do mês · 2. Lançamentos · 3. Novo lançamento · 4. Aportes · 5. Meses.
Acrescentadas por esta decisão (ADMIN apenas, em "Mais"/engrenagem):
6. **Sócios** — lista com percentual vigente e soma 100%; criar/editar com "vale a partir de" (mês); inativar.
7. **Usuários** — lista, criar, editar perfil, redefinir senha, inativar.

SOCIO vê só as telas 1, 2, 4 e 5, sem botões de ação.

## 6. Arquitetura

- Repositório e projeto Vercel novos; sem serviço fora da Vercel.
- Node + API em funções da Vercel; PostgreSQL (Neon via Marketplace da Vercel, `DATABASE_URL` injetada).
- Front-end sem framework pesado, em páginas servidas pela Vercel, com `manifest.webmanifest` e service worker (cache do shell e da última leitura de cada mês para consulta offline; edição exige conexão).
- Login por e-mail e senha, sessão por cookie httpOnly; todas as rotas de escrita exigem ADMIN no servidor.
- Exportar mês em PDF/imagem no formato da planilha; "Copiar cobrança" gera texto de WhatsApp com valor e vencimento de cada aporte pendente.

## 7. Testes

- Unidade: saldo corrido, abertura de mês (parcelas, dia 31), cálculo de aporte com ajuste, soma 100%, vigência de percentual.
- API: SOCIO recebe 403 em toda escrita; mês fechado recusa edição; último ADMIN protegido.
- Conferência manual com os números de outubro/26 da planilha (débitos 5.507,50; aportes 5.523,73).

## 8. Decisão sobre outubro/26

Confirmado pelo Gilmar: o rateio segue o percentual de cada sócio. As diferenças de outubro (Lígia 302,25 abaixo, Henrique 16,22 acima) foram um acerto de valores de setembro entre Lígia e Henrique, liquidado em outubro. Não há regra fixa; fica como acerto entre sócios (regra 5).

## 9. Fora do escopo

Integração bancária, pagamento automático, notificação push, WhatsApp automático.
