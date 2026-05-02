export function somarValores(itens) {
  return (itens || []).reduce((acc, item) => acc + Number(item?.valor || 0), 0);
}

export function somarQuantidades(itens) {
  return (itens || []).reduce((acc, item) => acc + Number(item?.quantidade || 0), 0);
}

export function somarFundosCaixa(caixas) {
  return (caixas || []).reduce((acc, caixa) => acc + Number(caixa?.fundoCaixa || 0), 0);
}

export function calcularResumoFinanceiro({
  vendas = [],
  despesas = [],
  retiradas = [],
  caixas = [],
}) {
  const entradas = somarValores(vendas);
  const despesasOperacionais = somarValores(despesas);
  const retiradasCaixa = somarValores(retiradas);
  const gastos = despesasOperacionais + retiradasCaixa;
  const fundoCaixa = somarFundosCaixa(caixas);
  const emCaixa = fundoCaixa + entradas - retiradasCaixa;
  const resultado = entradas - gastos;

  return {
    entradas,
    despesasOperacionais,
    retiradasCaixa,
    gastos,
    fundoCaixa,
    emCaixa,
    resultado,
  };
}
