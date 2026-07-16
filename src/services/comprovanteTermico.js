function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function quantity(item) {
  const value = Number(item?.quantidade || 0);
  return item?.unidadeVenda === "kg"
    ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`
    : `${value} un`;
}

function paymentRows(venda) {
  const pagamentos = Array.isArray(venda?.pagamentos) && venda.pagamentos.length
    ? venda.pagamentos
    : [{ forma: venda?.formaPagamento, valor: venda?.total }];
  return pagamentos.map((item) => `<div class="line"><span>${escapeHtml(item.forma)}</span><span>${money(item.valor)}</span></div>`).join("");
}

export function imprimirComprovanteTermico({ loja, venda }) {
  const popup = window.open("", "_blank", "width=420,height=720");
  if (!popup) {
    throw new Error("Permita pop-ups para imprimir o comprovante da venda.");
  }

  const itens = Array.isArray(venda?.itens) ? venda.itens : [];
  const rows = itens.map((item) => `
    <div class="item">
      <strong>${escapeHtml(item.nome)}</strong>
      <div class="line"><span>${escapeHtml(quantity(item))} x ${money(item.precoUnitario)}</span><span>${money(item.subtotal)}</span></div>
    </div>
  `).join("");
  const isCash = Array.isArray(venda?.pagamentos)
    ? venda.pagamentos.some((item) => item.forma === "Dinheiro")
    : venda?.formaPagamento === "Dinheiro";

  popup.document.write(`<!doctype html>
  <html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante</title>
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body { width: 74mm; margin: 0 auto; color: #000; font: 12px/1.35 ui-monospace, Consolas, monospace; }
    h1 { margin: 0; font-size: 17px; text-align: center; }
    .center { text-align: center; } .muted { font-size: 10px; }
    .rule { border-top: 1px dashed #000; margin: 8px 0; }
    .line { display: flex; justify-content: space-between; gap: 8px; }
    .item { margin: 5px 0; } .total { font-size: 16px; font-weight: 700; }
    @media screen { body { padding: 12px 0; } }
  </style></head><body>
    <h1>${escapeHtml(loja?.nome || "ACS")}</h1>
    ${loja?.documento ? `<div class="center muted">${escapeHtml(loja.documento)}</div>` : ""}
    ${loja?.endereco ? `<div class="center muted">${escapeHtml(loja.endereco)}</div>` : ""}
    <div class="rule"></div>
    <div>COMPROVANTE NAO FISCAL</div>
    <div>${escapeHtml(venda?.dataHora || new Date().toLocaleString("pt-BR"))}</div>
    <div>Atendente: ${escapeHtml(venda?.atendenteNome)}</div>
    <div>Caixa: ${escapeHtml(venda?.caixaId)}</div>
    <div class="rule"></div>${rows}<div class="rule"></div>
    <div class="line total"><span>TOTAL</span><span>${money(venda?.total)}</span></div>
    <div>Pagamento(s)</div>${paymentRows(venda)}
    ${isCash ? `<div class="line"><span>Recebido</span><span>${money(venda?.valorRecebido)}</span></div><div class="line"><span>Troco</span><span>${money(venda?.troco)}</span></div>` : ""}
    <div class="rule"></div><div class="center">Obrigado pela preferencia!</div>
    <script>window.addEventListener('load', () => { window.print(); window.addEventListener('afterprint', () => window.close()); });</script>
  </body></html>`);
  popup.document.close();
}
