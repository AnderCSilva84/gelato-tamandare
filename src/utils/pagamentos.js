export const FORMAS_PAGAMENTO = ["PIX", "Dinheiro", "Debito", "Credito"];
export function pagamentosDaVenda(venda) {
  if (Array.isArray(venda?.pagamentos) && venda.pagamentos.length) {
    return venda.pagamentos.filter((item) => Number(item?.valor || 0) > 0);
  }
  return venda?.formaPagamento
    ? [{ forma: venda.formaPagamento, valor: Number(venda.valor || 0) }]
    : [];
}

export function resumirPagamentos(vendas) {
  const totais = { PIX: 0, Dinheiro: 0, Debito: 0, Credito: 0 };
  (vendas || []).forEach((venda) => {
    pagamentosDaVenda(venda).forEach((pagamento) => {
      const forma = String(pagamento.forma || "");
      const valor = Number(pagamento.valor || 0);
      if (Object.hasOwn(totais, forma)) totais[forma] += valor;
    });
  });
  return totais;
}

export function descreverPagamentos(venda) {
  return pagamentosDaVenda(venda)
    .map((item) => `${item.forma}: ${Number(item.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`)
    .join(" + ");
}
