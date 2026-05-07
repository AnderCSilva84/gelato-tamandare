# Manual do Sistema

## Visao geral
O sistema Gelato Tamandare foi feito para operar o dia a dia da loja. Ele organiza vendas, caixa, estoque, despesas, retiradas e relatorios em uma unica plataforma.

## Perfis de acesso
### Atendente
- Pode operar o PDV
- Pode abrir caixa
- Pode registrar vendas
- Pode fazer retirada, quando permitido pelo fluxo operacional

### Gerencia
- Acessa todos os modulos
- Acompanha indicadores
- Cadastra produtos e atendentes
- Gera relatorios
- Controla despesas e historico financeiro

### Superadmin
- Tem todos os acessos da gerencia
- Pode ativar e desativar o modo manutencao
- Pode definir o titulo e a mensagem exibidos quando o sistema estiver fora do ar
- Pode criar o primeiro acesso autenticado do painel
- Pode promover novos superadmins

## Modulos
### 1. PDV / Caixa
Serve para abrir o caixa e registrar as vendas do turno.

#### O que faz
- Abrir caixa com fundo inicial
- Selecionar produtos
- Adicionar varios itens antes de finalizar
- Escolher forma de pagamento
- Calcular troco em dinheiro
- Registrar retirada/sangria
- Fechar caixa
- Exportar PDF de fechamento

#### Indicadores principais
- Fundo inicial
- Retiradas
- Total no turno
- Itens no turno
- Ticket medio
- Disponivel em caixa

### 2. Gerencia
Tela de visao rapida do dia.

#### O que mostra
- Entradas
- Gastos
- Em caixa
- Resultado
- Caixas abertos
- Ultimas vendas
- Saidas do dia
- Alertas de estoque

#### Controle de manutencao
- O superadmin pode ativar o modo manutencao
- Pode definir o titulo e a mensagem que aparecerao na tela de bloqueio
- Quando a manutencao estiver ativa, somente usuarios com role superadmin conseguem entrar no sistema
- O proprio superadmin pode desativar a manutencao pelo painel

### 3. Fluxo de caixa
Area administrativa de movimentacao financeira.

#### O que faz
- Registrar despesas
- Editar despesas
- Excluir despesas
- Mostrar saidas do dia
- Mostrar vendas da data

### 4. Estoque
Controle dos produtos.

#### O que faz
- Cadastrar produto
- Definir preco de custo e preco final
- Definir estoque
- Vincular imagem
- Registrar nota fiscal
- Ativar ou desativar produto
- Exportar PDF de inventario

### 5. Atendentes
Controle de usuarios do sistema.

#### O que faz
- Cadastrar atendente
- Definir senha operacional
- Definir role
- Definir meta
- Ativar ou desativar
- Vincular email e senha de acesso ao painel para gerencia e superadmin

### 6. Relatorios
Analise por periodo.

#### O que mostra
- Entradas
- Gastos
- Em caixa
- Resultado
- Vendas por atendente
- Saidas do periodo
- Caixas do periodo

### 7. Extrato e lancamentos
Historico de movimentacoes.

#### O que faz
- Filtrar por data
- Registrar lancamento retroativo
- Exportar PDF

## Conceitos financeiros do sistema
### Entradas
Valor total de vendas registradas.

### Gastos
Soma de despesas operacionais mais retiradas.

### Retirada
Sangria do caixa. Reduz o valor fisico disponivel no caixa.

### Em caixa
Fundo inicial + entradas - retiradas.

### Resultado
Entradas - gastos.

## Fluxo recomendado de uso
1. Abrir caixa com fundo inicial.
2. Registrar vendas durante o turno.
3. Fazer retiradas quando necessario.
4. Registrar despesas operacionais.
5. Conferir entradas, gastos e caixa.
6. Exportar PDF de fechamento.
7. Fechar caixa.

## Acesso ao painel
- O PDV continua disponivel mesmo sem login na gerencia
- As telas de gerencia, estoque, atendentes, fluxo e relatorios exigem email e senha de acesso ao painel
- A senha operacional do atendente continua separada e e usada no fluxo do caixa
- Se ainda nao existir nenhum acesso autenticado, o sistema mostra a configuracao inicial do superadmin na barra lateral

## Observacoes importantes
- Retirada e despesa nao sao a mesma coisa.
- Retirada afeta diretamente o valor disponivel em caixa.
- Despesa entra no gasto total.
- O sistema busca evitar redundancia entre indicadores.
- O modo manutencao e indicado para tirar o sistema do ar sem desligar a hospedagem.
