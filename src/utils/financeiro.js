export function somarValores(itens) {
  return (itens || []).reduce((acc, item) => acc + Number(item?.valor || 0), 0);
}

export function somarQuantidades(itens) {
  return (itens || []).reduce((acc, item) => acc + Number(item?.quantidade || 0), 0);
}

export function somarFundosCaixa(caixas) {
  return (caixas || []).reduce((acc, caixa) => acc + Number(caixa?.fundoCaixa || 0), 0);
}

export function somarEntradasConsolidadas(itens) {
  return (itens || []).reduce(
    (acc, item) =>
      acc +
      Number(
        item?.total ??
          Number(item?.dinheiro || 0) + Number(item?.pix || 0) + Number(item?.cartao || 0)
      ),
    0
  );
}

export function calcularResumoFinanceiro({
  vendas = [],
  despesas = [],
  retiradas = [],
  caixas = [],
  entradasConsolidadas = [],
}) {
  const entradasVendas = somarValores(vendas);
  const entradasExtras = somarEntradasConsolidadas(entradasConsolidadas);
  const entradas = entradasVendas + entradasExtras;
  const despesasOperacionais = somarValores(despesas);
  const retiradasCaixa = somarValores(retiradas);
  const gastos = despesasOperacionais + retiradasCaixa;
  const fundoCaixa = somarFundosCaixa(caixas);
  const emCaixa = fundoCaixa + entradas - despesasOperacionais - retiradasCaixa;
  const resultado = entradas - gastos;

  return {
    entradas,
    entradasVendas,
    entradasExtras,
    despesasOperacionais,
    retiradasCaixa,
    gastos,
    fundoCaixa,
    emCaixa,
    resultado,
  };
}
