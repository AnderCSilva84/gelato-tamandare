export const FORMAS_PAGAMENTO = ["PIX", "Dinheiro", "Debito", "Credito"];

export function normalizarFormaPagamento(forma) {
  const valor = String(forma || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (valor === "pix") return "PIX";
  if (valor === "dinheiro") return "Dinheiro";
  if (valor === "debito" || valor === "cartao de debito") return "Debito";
  if (valor === "credito" || valor === "cartao de credito") return "Credito";
  return String(forma || "").trim();
}

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
  (vendas || []).filter(venda => venda.status !== "cancelada").forEach((venda) => {
    pagamentosDaVenda(venda).forEach((pagamento) => {
      const forma = normalizarFormaPagamento(pagamento.forma);
      const valor = Number(pagamento.valor || 0);
      if (Object.hasOwn(totais, forma)) totais[forma] += Math.round(valor * 100);
    });
  });
  return Object.fromEntries(Object.entries(totais).map(([forma, centavos]) => [forma, centavos / 100]));
}

export function descreverPagamentos(venda) {
  return pagamentosDaVenda(venda)
    .map((item) => `${item.forma}: ${Number(item.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`)
    .join(" + ");
}
