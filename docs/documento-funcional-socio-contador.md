# Documento Funcional Para Socio Ou Contador

## Finalidade
Este documento descreve como o sistema Gelato Tamandare organiza as informacoes operacionais e financeiras da loja, com foco em entendimento gerencial, conferencia e apoio contabil.

## Escopo do sistema
O sistema cobre:
- vendas
- caixa
- retiradas
- despesas
- estoque
- atendentes
- relatorios

Nao substitui sistema fiscal ou ERP contabil completo. Ele funciona como sistema operacional e gerencial da loja.

## Registro das movimentacoes
### 1. Vendas
Cada venda registra:
- produto
- quantidade
- valor
- atendente
- forma de pagamento
- caixa vinculado
- data

### 2. Despesas
Cada despesa registra:
- descricao
- valor
- data

### 3. Retiradas
Cada retirada registra:
- valor
- motivo
- atendente
- caixa vinculado
- data

## Regras de leitura financeira
### Entradas
Correspondem ao total de vendas registradas.

### Gastos
Correspondem a:

`despesas operacionais + retiradas`

### Em caixa
Corresponde a:

`fundo inicial + entradas - retiradas`

Esse numero representa o valor operacional disponivel no caixa, e nao necessariamente o lucro.

### Resultado
Corresponde a:

`entradas - gastos`

Esse numero serve como leitura gerencial resumida do periodo.

## Diferenca entre despesa e retirada
### Despesa
Representa um gasto do negocio.
Exemplos:
- compra emergencial
- insumo
- pagamento operacional

### Retirada
Representa saida de dinheiro do caixa.
Exemplos:
- sangria
- remocao de dinheiro para seguranca

No sistema, retirada entra no gasto total e reduz o caixa disponivel.

## Fechamento de caixa
No fechamento do turno o sistema consolida:
- atendente responsavel
- horario de abertura
- horario de fechamento
- fundo inicial
- total vendido
- retiradas do turno
- itens vendidos
- formas de pagamento
- valor disponivel em caixa

Tambem gera PDF para conferencia e arquivo interno.

## Relatorios disponiveis
### Relatorio gerencial por periodo
Exibe:
- entradas
- gastos
- em caixa
- resultado
- vendas por atendente
- saidas do periodo
- caixas do periodo

### Fluxo de caixa
Exibe:
- vendas da data
- despesas da data
- retiradas da data
- saldo/resultado diario

### Fechamento de caixa
Exibe:
- resumo do turno
- retiradas
- vendas
- distribuicao por forma de pagamento

## Utilidade para socio
- acompanhar desempenho diario
- comparar vendas e gastos
- saber quanto realmente ficou em caixa
- entender o comportamento operacional da equipe

## Utilidade para contador
- receber historico organizado das operacoes
- separar entradas e gastos
- identificar retiradas de caixa
- usar os PDFs e relatorios como base de conferencia

## Limitacoes atuais
- nao faz emissao fiscal
- nao substitui apuracao contabil formal
- depende do correto registro operacional pela equipe

## Conclusao
O sistema oferece uma visao operacional precisa da loja, com foco em:
- quanto entrou
- quanto foi gasto
- quanto saiu por retirada
- quanto ficou em caixa

Ele serve como base gerencial confiavel para acompanhamento interno, conferencia e apoio ao financeiro.
