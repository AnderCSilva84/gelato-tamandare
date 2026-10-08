import { resumirPagamentos } from './pagamentos.js';
const arredondar = valor => Math.round(valor * 100) / 100;
export function somarValores(itens) {
  return (itens || []).filter(item => item.status !== 'cancelada').reduce((acc, item) => acc + Math.round(Number(item?.valor || 0) * 100), 0) / 100;
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
  // Withdrawals transfer money out of a drawer; they are not an expense.
  const resultado = arredondar(entradas - despesasOperacionais);
  const dinheiroVendas = resumirPagamentos(vendas).Dinheiro;
  const dinheiroEntradasExtras = entradasConsolidadas.reduce((n, i) => n + Number(i.dinheiro || 0), 0);
  const dinheiroEmCaixa = arredondar(fundoCaixa + dinheiroVendas + dinheiroEntradasExtras - retiradasCaixa);
  const custoConhecido = vendas.filter(v => Number.isFinite(v.custoTotal)).reduce((n, v) => n + v.custoTotal, 0);

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
    dinheiroEmCaixa,
    custoConhecido: arredondar(custoConhecido),
    margemVendasConhecida: arredondar(vendas.filter(v => Number.isFinite(v.custoTotal)).reduce((n, v) => n + v.valor - v.custoTotal, 0)),
    vendasSemCustoHistorico: vendas.filter(v => !Number.isFinite(v.custoTotal)).length,
  };
}
