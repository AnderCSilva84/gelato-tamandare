import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoGelato from "../assets/gelatoimg.jpeg";
import { deleteCaixa, getCaixas } from "../services/caixas";
import { getProdutos } from "../services/produtos";
import {
  getDespesas,
  getVendas,
  getVendasPorCaixa,
  subscribeResumoDiario,
  subscribeVendasDoDia,
} from "../services/vendas";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getLogoDataUrl() {
  const response = await fetch(logoGelato);
  const blob = await response.blob();
  return fileToDataUrl(blob);
}

function drawSummaryCard(doc, { x, y, w, h, title, value, fillColor, textColor = [24, 33, 47] }) {
  doc.setFillColor(...fillColor);
  doc.roundedRect(x, y, w, h, 5, 5, "F");
  doc.setTextColor(96, 112, 134);
  doc.setFontSize(9);
  doc.text(title, x + 4, y + 6);
  doc.setTextColor(...textColor);
  doc.setFontSize(16);
  doc.text(value, x + 4, y + 16);
}

export default function Relatorio({ uid, dataHoje }) {
  const [dataInicioFiltro, setDataInicioFiltro] = useState(dataHoje);
  const [dataFimFiltro, setDataFimFiltro] = useState(dataHoje);
  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState([]);
  const [vendasHoje, setVendasHoje] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [caixas, setCaixas] = useState([]);
  const [caixaSelecionado, setCaixaSelecionado] = useState(null);
  const [vendasCaixaSelecionado, setVendasCaixaSelecionado] = useState([]);
  const [resumoHoje, setResumoHoje] = useState(null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      setLoading(true);
      const [vendasData, despesasData] = await Promise.all([
        getVendas(uid, dataInicioFiltro, dataFimFiltro),
        getDespesas(uid, dataInicioFiltro, dataFimFiltro),
      ]);
      const caixasData = await getCaixas(dataInicioFiltro, dataFimFiltro);

      if (!ativo) return;
      setVendas(vendasData);
      setDespesas(despesasData);
      setCaixas(caixasData);
      setCaixaSelecionado((prev) =>
        prev ? caixasData.find((item) => item.id === prev.id) || null : null
      );
      setLoading(false);
    }

    if (uid && dataInicioFiltro && dataFimFiltro) {
      carregar();
    }

    return () => {
      ativo = false;
    };
  }, [uid, dataInicioFiltro, dataFimFiltro]);

  useEffect(() => {
    if (!uid || !dataHoje) return;

    const unsubVendasHoje = subscribeVendasDoDia(uid, dataHoje, setVendasHoje);
    const unsubResumoHoje = subscribeResumoDiario(dataHoje, setResumoHoje);

    return () => {
      unsubVendasHoje();
      unsubResumoHoje();
    };
  }, [uid, dataHoje]);

  useEffect(() => {
    let ativo = true;

    async function carregarCaixaSelecionado() {
      if (!caixaSelecionado?.id) {
        setVendasCaixaSelecionado([]);
        return;
      }

      const vendasData = await getVendasPorCaixa(caixaSelecionado.id);
      if (!ativo) return;
      setVendasCaixaSelecionado(vendasData);
    }

    carregarCaixaSelecionado();

    return () => {
      ativo = false;
    };
  }, [caixaSelecionado]);

  const totalVendas = useMemo(
    () => vendas.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [vendas]
  );
  const totalDespesas = useMemo(
    () => despesas.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [despesas]
  );
  const lucro = totalVendas - totalDespesas;
  const totalVendasHojeCalculado = useMemo(
    () => vendasHoje.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [vendasHoje]
  );
  const totalItensHojeCalculado = useMemo(
    () => vendasHoje.reduce((acc, item) => acc + Number(item.quantidade || 0), 0),
    [vendasHoje]
  );
  const totalVendasHoje = totalVendasHojeCalculado;
  const totalItensHoje = totalItensHojeCalculado;
  const vendasPorAtendente = useMemo(() => {
    const mapa = {};

    vendas.forEach((venda) => {
      const chave = venda.atendenteNome || venda.atendente || "Sem atendente";
      if (!mapa[chave]) {
        mapa[chave] = 0;
      }
      mapa[chave] += Number(venda.valor || 0);
    });

    return Object.entries(mapa)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [vendas]);

  async function excluirCaixa(item) {
    if (!item?.id || item.status === "aberto") return;

    const confirmar = window.confirm(
      `Excluir o caixa de ${item.atendenteNome} em ${item.data}?`
    );
    if (!confirmar) return;

    await deleteCaixa(item.id);
    setCaixas((prev) => prev.filter((caixa) => caixa.id !== item.id));
    if (caixaSelecionado?.id === item.id) {
      setCaixaSelecionado(null);
      setVendasCaixaSelecionado([]);
    }
  }

  async function exportarRelatorioPDF() {
    const produtos = await getProdutos();
    const totalEstoque = produtos.reduce((acc, produto) => acc + Number(produto.estoque || 0), 0);
    const totalProdutosAtivos = produtos.filter((produto) => produto.ativo !== false).length;
    const valorEstoque = produtos.reduce(
      (acc, produto) => acc + Number(produto.precoFinal ?? produto.preco ?? 0) * Number(produto.estoque || 0),
      0
    );

    const doc = new jsPDF();
    let y = 18;

    try {
      const logoDataUrl = await getLogoDataUrl();
      doc.addImage(logoDataUrl, "JPEG", 14, 10, 22, 22);
      y = 38;
    } catch {
      y = 18;
    }

    doc.setTextColor(24, 33, 47);
    doc.setFontSize(18);
    doc.text("Relatorio Gerencial", 42, y - 8);
    doc.setFontSize(11);
    doc.setTextColor(96, 112, 134);
    doc.text(`Periodo analisado: ${dataInicioFiltro} ate ${dataFimFiltro}`, 42, y - 2);
    y += 8;

    drawSummaryCard(doc, {
      x: 14,
      y,
      w: 58,
      h: 22,
      title: "RECEITAS",
      value: formatMoney(totalVendas),
      fillColor: [232, 247, 237],
      textColor: [22, 101, 52],
    });
    drawSummaryCard(doc, {
      x: 76,
      y,
      w: 58,
      h: 22,
      title: "SAIDAS",
      value: formatMoney(totalDespesas),
      fillColor: [254, 242, 242],
      textColor: [185, 28, 28],
    });
    drawSummaryCard(doc, {
      x: 138,
      y,
      w: 58,
      h: 22,
      title: "LUCRO",
      value: formatMoney(lucro),
      fillColor: lucro >= 0 ? [237, 244, 255] : [254, 242, 242],
      textColor: lucro >= 0 ? [37, 99, 235] : [185, 28, 28],
    });
    y += 30;

    doc.setTextColor(24, 33, 47);
    doc.setFontSize(12);
    doc.text("Vendas por atendente", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Atendente", "Total vendido"]],
      body: vendasPorAtendente.length
        ? vendasPorAtendente.map((item) => [item.nome, formatMoney(item.total)])
        : [["Sem registros", "-"]],
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 1: { halign: "right", textColor: [22, 101, 52], fontStyle: "bold" } },
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.text("Estoque", 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Indicador", "Valor"]],
      body: [
        ["Produtos ativos", String(totalProdutosAtivos)],
        ["Unidades em estoque", String(totalEstoque)],
        ["Valor estimado em estoque", formatMoney(valorEstoque)],
      ],
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 1: { halign: "right" } },
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.text("Despesas do periodo", 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Data", "Descricao", "Valor"]],
      body: despesas.length
        ? despesas.map((item) => [item.data, item.descricao, formatMoney(item.valor)])
        : [["-", "Nenhuma despesa registrada no periodo.", "-"]],
      theme: "grid",
      headStyles: { fillColor: [220, 38, 38], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 2: { halign: "right", textColor: [185, 28, 28], fontStyle: "bold" } },
    });

    const pdfBlobUrl = doc.output("bloburl");
    window.open(pdfBlobUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="dashboard-screen">
      <div className="screen-heading">
        <div>
          <h1 className="screen-title">Relatório</h1>
          <p className="screen-description">Resumo de vendas, despesas e lucro por data.</p>
        </div>
      </div>

      <div className="section-card filter-card">
        <div className="section-header">
          <div className="section-title">Filtro por periodo</div>
        </div>
        <input
          className="input"
          type="date"
          value={dataInicioFiltro}
          onChange={(e) => setDataInicioFiltro(e.target.value)}
        />
        <input
          className="input"
          type="date"
          value={dataFimFiltro}
          onChange={(e) => setDataFimFiltro(e.target.value)}
        />
        <div className="section-actions">
          <button className="action-btn action-btn-warning" type="button" onClick={exportarRelatorioPDF}>
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="section-card">
        <div className="section-header">
          <div className="section-title">Vendas de hoje</div>
          <span className="section-subtitle">{dataHoje}</span>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total vendido hoje</span>
            <strong className="stat-value positive">{formatMoney(totalVendasHoje)}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Itens vendidos hoje</span>
            <strong className="stat-value">{totalItensHoje}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Registros de venda</span>
            <strong className="stat-value">{vendasHoje.length}</strong>
          </div>
        </div>
        <div className="scroll-list">
          {vendasHoje.map((item) => (
            <div className="list-row" key={item.id}>
              <div>
                <strong>{item.produto}</strong>
                <small>
                  {item.quantidade} un. • {item.atendenteNome || item.atendente}
                </small>
              </div>
              <strong className="positive">{formatMoney(item.valor)}</strong>
            </div>
          ))}
          {!vendasHoje.length && <p className="empty-state">Nenhuma venda registrada hoje.</p>}
        </div>
      </div>

      <div className="stats-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Vendas</span>
          <strong className="stat-value positive">{formatMoney(totalVendas)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Despesas</span>
          <strong className="stat-value negative">{formatMoney(totalDespesas)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Lucro</span>
          <strong className={`stat-value ${lucro >= 0 ? "positive" : "negative"}`}>
            {formatMoney(lucro)}
          </strong>
        </div>
      </div>

      <div className="screen-grid">
        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Vendas do periodo</div>
          </div>
          <div className="scroll-list">
            {vendas.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.produto}</strong>
                  <small>
                    {item.quantidade} un. • {item.atendenteNome || item.atendente}
                  </small>
                </div>
                <strong className="positive">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {!vendas.length && !loading && <p className="empty-state">Nenhuma venda encontrada.</p>}
          </div>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Despesas do periodo</div>
          </div>
          <div className="scroll-list">
            {despesas.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.descricao}</strong>
                  <small>{item.data}</small>
                </div>
                <strong className="negative">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {!despesas.length && !loading && <p className="empty-state">Nenhuma despesa encontrada.</p>}
          </div>
        </div>
      </div>

      <div className="screen-grid">
        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Caixas dos atendentes</div>
            <span className="section-subtitle">{caixas.length} caixas no periodo</span>
          </div>
          <div className="scroll-list">
            {caixas.map((caixa) => (
              <div
                className={`list-row caixa-row-btn ${caixaSelecionado?.id === caixa.id ? "is-selected" : ""}`}
                key={caixa.id}
              >
                <button
                  className="caixa-row-content"
                  type="button"
                  onClick={() => setCaixaSelecionado(caixa)}
                >
                  <div>
                    <strong>
                      Caixa {caixa.atendenteNome} ({caixa.status === "aberto" ? "Aberto" : "Fechado"})
                    </strong>
                    <small>
                      {caixa.data} • {Number(caixa.totalItens || 0)} itens •{" "}
                      {caixa.status === "fechado"
                        ? `Fechado com ${formatMoney(caixa.totalVendas || 0)}`
                        : formatMoney(caixa.totalVendas || 0)}
                    </small>
                  </div>
                </button>
                {caixa.status !== "aberto" ? (
                  <button
                    className="mini-btn danger"
                    type="button"
                    onClick={() => excluirCaixa(caixa)}
                  >
                    Excluir
                  </button>
                ) : null}
              </div>
            ))}
            {!caixas.length && !loading && <p className="empty-state">Nenhum caixa encontrado no periodo.</p>}
          </div>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">
              {caixaSelecionado
                ? `Extrato do caixa ${caixaSelecionado.atendenteNome}`
                : "Extrato do caixa"}
            </div>
            <span className="section-subtitle">
              {caixaSelecionado
                ? caixaSelecionado.status === "aberto"
                  ? "Aberto"
                  : "Fechado"
                : "Selecione um caixa"}
            </span>
          </div>
          <div className="scroll-list">
            {vendasCaixaSelecionado.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.produto}</strong>
                  <small>
                    {item.quantidade} un. • {item.formaPagamento || "Sem forma"} •{" "}
                    {item.atendenteNome || item.atendente}
                  </small>
                </div>
                <strong className="positive">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {!vendasCaixaSelecionado.length && (
              <p className="empty-state">
                {caixaSelecionado
                  ? "Nenhuma venda encontrada para este caixa."
                  : "Selecione um caixa para ver o extrato."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
