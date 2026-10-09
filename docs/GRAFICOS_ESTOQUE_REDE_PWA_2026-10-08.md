# Gráficos de rede, giro de estoque e tablet

Implementação no PWA PDV ACS, preservando a separação do Café Guajará e o funcionamento financeiro existente.

## Telas

- Comparar unidades: entradas (vendas + consolidadas), saídas (despesas + retiradas), ranking e picos por dia da semana/hora. Filtro de unidade usa os dados já carregados. Resultado permanece vendas menos despesas, com explicação para não confundir retirada com despesa.
- Estoque: oito produtos mais vendidos no mês, com unidades e quilos separados; oito produtos com saldo disponível há mais tempo sem venda válida. Período e unidade do ranking não fazem consultas adicionais.
- PDV: Finalizar substitui Cobrar no PWA; Cancelar vermelho com a mesma fonte de 18 px, peso e altura de 56 px. Ícones em Pix, dinheiro, débito e crédito. Quantidade tem controles de 44 × 44 px. Preço unitário aparece abaixo do produto para liberar espaço no carrinho; produtos por peso preservam valor e peso.

## Leituras e integridade

- Giro usa campos `giroDiario` e `giroInicializado` nos produtos já carregados pela tela. Nenhuma leitura adicional para os gráficos de estoque.
- Venda e estorno atualizam o giro na mesma transação e no mesmo documento de produto; não acrescentam leituras nessas operações. Resumos diários incluem horas e quantidades de registros; entradas e retiradas também atualizam seus resumos.
- Comparação consulta resumos por unidade e período, em lugar de cada venda/despesa. Mantém a consulta dos caixas para preservar a contagem exibida. Cache de 60 segundos por usuário/unidade/período e reutilização de chamadas em andamento; Atualizar recarrega explicitamente. Não há listener adicional contínuo.
- Campos de giro são protegidos contra alteração pelo navegador e mapas de giro/horas não são indexados. Novo índice de resumo por uid/data foi criado e confirmado pronto antes da publicação.
- Preparação histórica executada uma vez com caixas fechados, usando transações por loja. Lê históricos existentes e grava somente estatísticas de produtos e resumos, sem alterar vendas, despesas, entradas, retiradas, preços ou estoque. Relatório em `analytics-preparacao-gelato-cb6fd.json`.
- Foram preparados 80 produtos e 301 dias de resumo. 475 vendas antigas não têm vínculo identificável com produto atual e permanecem nos totais financeiros, fora do ranking de produto. Nenhuma associação ambígua foi atribuída por suposição.
- “Tempo parado” mede desde a última venda válida, ou desde o cadastro se nunca vendeu. Não mede idade/validade de lote. Sem data confiável, não é apresentado número de dias.

## Verificação

Lint, compilações das duas lojas, regras de Firestore/Storage, testes financeiros em emuladores e operações na nuvem de homologação passaram. Testes incluem idempotência, concorrência, venda/estorno, movimentação de entradas/retiradas entre datas e bloqueio de alterações dos indicadores pelo cliente.

Conferência visual com conta e dados fictícios no projeto isolado: 1024×768, 768×1024, 1280×800 e 390×844, sem rolagem horizontal da página nos cenários verificados. Mesma fonte/altura dos botões, quatro ícones e controles de toque de 44 px conferidos pelo DOM. Testes do navegador não substituem homologação no tablet físico.

Publicações e verificação dos arquivos servidos: `analytics-publicacao-2026-10-08.json`. Android não foi recompilado nem publicado nesta etapa.
