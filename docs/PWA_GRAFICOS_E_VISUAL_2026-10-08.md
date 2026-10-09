# Gráficos de vendas e refinamento visual do PWA

Publicado nos dois sites em 08/10/2026, às 22:37 de Fortaleza.

## Análise de movimento

Em Relatórios, selecionar as datas inicial e final. O novo painel apresenta os totais por dia da semana e hora, destaca os maiores movimentos e oferece um mapa de dia × horário. Selecionar Faturamento ou Pedidos e tocar em uma faixa do mapa para consultar seus valores.

Os dados pertencem à unidade selecionada e seguem America/Fortaleza. Vendas canceladas são excluídas; os valores são somados em centavos. Pedidos com várias linhas de produto são contados uma vez pelo identificador da venda; registros antigos sem identificador são contados separadamente. Vendas sem horário confiável entram nos totais por dia e são explicitamente excluídas da análise horária. Os gráficos usam os dados já carregados pelo relatório, sem consultas extras ao Firestore.

## Identidade visual

Superfícies claras, contornos discretos, detalhes em azul, cartões com fotos maiores, catálogo e pedido lado a lado no computador e tablet. O pedido tem quantidade com controles de mais e menos, total destacado, atalhos de pagamento e botão Cobrar em verde. Pagamentos divididos, produtos vendidos por peso e os controles de caixa permanecem disponíveis.

No celular o catálogo e o pedido ficam empilhados. A identidade em café/creme e o site separado do Café Guajará foram preservados. Os estilos novos usam a classe pwa-ui; o APK Android não foi alterado ou publicado.

## Validação

Teste de cálculo aprovado para cancelamentos, centavos, duplicatas, agrupamento de produtos por pedido, datas inválidas, conversão de horário e ausência de horário. Lint e compilações de Gelato/Sabor e Café Guajará aprovados.

Na homologação isolada, o gráfico apresentou R$ 595,00 e 14 pedidos fictícios, com pico entre 18h e 19h. Testados troca de métrica, carrinho, alteração de quantidade e seleção de pagamento. Verificados os tamanhos de computador, tablet e celular; no celular, a largura da página igualou a largura disponível e o carrinho não apresentou corte horizontal.

Os arquivos publicados de HTML, JavaScript principal, relatório e CSS foram conferidos por SHA-256 contra os pacotes locais. Nenhuma venda ou movimentação financeira foi criada em produção durante a verificação. A conta e os registros fictícios da homologação foram removidos após os testes.

Evidência: `pwa-refino-publicacao-2026-10-08.json`.
