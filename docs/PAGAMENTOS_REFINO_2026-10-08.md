# Refinamento dos pagamentos no PWA

- Pix: texto e ícone azuis; dinheiro: verdes; crédito: pretos; débito: cinza. O estado selecionado mantém a cor da forma de pagamento, com borda e fundo correspondentes.
- Valor informado, recebido em dinheiro e troco usam cantos arredondados de 10 px, espaçamento de 14 × 16 px, altura mínima de 104 px e valores de 20 px. Recebido e troco têm a mesma cor e tipografia. O campo editável possui rótulo acessível.
- Tablet utilizado em paisagem, conforme informado pelo usuário. Conferência de layout em 1024×768 sem rolagem horizontal da página. As cores dos textos e ícones foram verificadas no DOM.
- Cálculo conferido com dados fictícios: total R$ 6,00, recebido R$ 20,00, troco R$ 14,00. Nenhuma venda foi finalizada nesta conferência.
- Alterações somente visuais: nenhuma consulta adicional ao Firestore, nenhuma mudança de cálculo ou backend. As duas compilações e o lint passaram. A conta e os dados fictícios foram removidos da homologação.
- Publicação nos dois sites, preservando o Café Guajará separado. Verificação dos arquivos servidos em `pagamentos-refino-publicacao-2026-10-08.json`. Não houve recompilação ou publicação do Android.
