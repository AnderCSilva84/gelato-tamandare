import { useCallback, useEffect, useMemo, useState } from "react";
import logoGelato from "../assets/gelatoimg.jpeg";
import {
  deleteCaixa,
  fecharCaixa,
  deleteRetiradaCaixa,
  getCaixas,
  getRetiradas,
  updateRetiradaCaixa,
} from "../services/caixas";
import { getProdutos } from "../services/produtos";
import {
  deleteDespesa,
  getDespesas,
  getVendas,
  getVendasPorCaixa,
  subscribeVendasDoDia,
  updateDespesa,
} from "../services/vendas";
import { calcularResumoFinanceiro } from "../utils/financeiro";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateLabel(valor) {
  if (!valor) return "";
  const [ano, mes, dia] = String(valor).split("-");
  if (!ano || !mes || !dia) return String(valor);
  return `${dia}-${mes}-${ano}`;
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
  const [retiradas, setRetiradas] = useState([]);
  const [caixas, setCaixas] = useState([]);
  const [caixaSelecionado, setCaixaSelecionado] = useState(null);
  const [vendasCaixaSelecionado, setVendasCaixaSelecionado] = useState([]);
  const [saidaEditando, setSaidaEditando] = useState(null);
  const [saidaForm, setSaidaForm] = useState({ descricao: "", valor: "", data: "" });

  const carregarPeriodoAtual = useCallback(async () => {
    setLoading(true);
    const [vendasData, despesasData, retiradasData] = await Promise.all([
      getVendas(uid, dataInicioFiltro, dataFimFiltro),
      getDespesas(uid, dataInicioFiltro, dataFimFiltro),
      getRetiradas(dataInicioFiltro, dataFimFiltro),
    ]);
    const caixasData = await getCaixas(dataInicioFiltro, dataFimFiltro);

    setVendas(vendasData);
    setDespesas(despesasData);
    setRetiradas(retiradasData);
    setCaixas(caixasData);
    setCaixaSelecionado((prev) =>
      prev ? caixasData.find((item) => item.id === prev.id) || null : null
    );
    setLoading(false);
  }, [dataFimFiltro, dataInicioFiltro, uid]);

  useEffect(() => {
    async function carregar() {
      await carregarPeriodoAtual();
    }

    if (uid && dataInicioFiltro && dataFimFiltro) {
      carregar();
    }
  }, [carregarPeriodoAtual, uid, dataInicioFiltro, dataFimFiltro]);

  useEffect(() => {
    if (!uid || !dataHoje) return;

    const unsubVendasHoje = subscribeVendasDoDia(uid, dataHoje, setVendasHoje);
    return () => {
      unsubVendasHoje();
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

  const resumoFinanceiro = useMemo(
    () => {
      const caixaIds = new Set(caixas.map((item) => item.id));
      const vendasVinculadas = vendas.filter((item) => item.caixaId && caixaIds.has(item.caixaId));
      const retiradasVinculadas = retiradas.filter(
        (item) => item.caixaId && caixaIds.has(item.caixaId)
      );

      return calcularResumoFinanceiro({
        vendas: vendasVinculadas,
        despesas,
        retiradas: retiradasVinculadas,
        caixas,
      });
    },
    [caixas, despesas, retiradas, vendas]
  );
  const vendasPeriodoVinculadas = useMemo(() => {
    const caixaIds = new Set(caixas.map((item) => item.id));
    return vendas.filter((item) => item.caixaId && caixaIds.has(item.caixaId));
  }, [caixas, vendas]);
  const retiradasPeriodoVinculadas = useMemo(() => {
    const caixaIds = new Set(caixas.map((item) => item.id));
    return retiradas.filter((item) => item.caixaId && caixaIds.has(item.caixaId));
  }, [caixas, retiradas]);
  const saidasPeriodo = useMemo(
    () =>
      [
        ...despesas.map((item) => ({
          ...item,
          descricaoLinha: item.descricao,
          origem: "Despesa",
          tipoSaida: "despesa",
        })),
        ...retiradasPeriodoVinculadas.map((item) => ({
          ...item,
          descricaoLinha: item.motivo || "Sangria de caixa",
          origem: "Retirada",
          tipoSaida: "retirada",
        })),
      ].sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))),
    [despesas, retiradasPeriodoVinculadas]
  );
  const totalVendasHojeCalculado = useMemo(
    () => {
      const caixaIdsHoje = new Set(
        caixas.filter((item) => item.data === dataHoje).map((item) => item.id)
      );
      return vendasHoje
        .filter((item) => item.caixaId && caixaIdsHoje.has(item.caixaId))
        .reduce((acc, item) => acc + Number(item.valor || 0), 0);
    },
    [caixas, dataHoje, vendasHoje]
  );
  const totalItensHojeCalculado = useMemo(
    () => {
      const caixaIdsHoje = new Set(
        caixas.filter((item) => item.data === dataHoje).map((item) => item.id)
      );
      return vendasHoje
        .filter((item) => item.caixaId && caixaIdsHoje.has(item.caixaId))
        .reduce((acc, item) => acc + Number(item.quantidade || 0), 0);
    },
    [caixas, dataHoje, vendasHoje]
  );
  const totalVendasHoje = totalVendasHojeCalculado;
  const totalItensHoje = totalItensHojeCalculado;
  const vendasHojeVinculadas = useMemo(() => {
    const caixaIdsHoje = new Set(
      caixas.filter((item) => item.data === dataHoje).map((item) => item.id)
    );
    return vendasHoje.filter((item) => item.caixaId && caixaIdsHoje.has(item.caixaId));
  }, [caixas, dataHoje, vendasHoje]);
  const vendasPorAtendente = useMemo(() => {
    const mapa = {};

    vendasPeriodoVinculadas.forEach((venda) => {
      const chave = venda.atendenteNome || venda.atendente || "Sem atendente";
      if (!mapa[chave]) {
        mapa[chave] = 0;
      }
      mapa[chave] += Number(venda.valor || 0);
    });

    return Object.entries(mapa)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [vendasPeriodoVinculadas]);

  async function excluirCaixa(item) {
    if (!item?.id || item.status === "aberto") return;

    const confirmar = window.confirm(
      `Excluir o caixa de ${item.atendenteNome} em ${item.data}?`
    );
    if (!confirmar) return;

    await deleteCaixa(item.id);
    if (caixaSelecionado?.id === item.id) setVendasCaixaSelecionado([]);
    await carregarPeriodoAtual();
  }

  async function fecharCaixaManual(item) {
    if (!item?.id || item.status !== "aberto") return;

    const confirmar = window.confirm(
      `Fechar o caixa de ${item.atendenteNome} em ${item.data}?`
    );
    if (!confirmar) return;

    const vendasDoCaixa = await getVendasPorCaixa(item.id);
    const retiradasDoCaixa = retiradas.filter((retirada) => retirada.caixaId === item.id);
    const totalVendas = vendasDoCaixa.reduce((acc, venda) => acc + Number(venda.valor || 0), 0);
    const totalItens = vendasDoCaixa.reduce((acc, venda) => acc + Number(venda.quantidade || 0), 0);
    const totalDinheiro = vendasDoCaixa
      .filter((venda) => venda.formaPagamento === "Dinheiro")
      .reduce((acc, venda) => acc + Number(venda.valor || 0), 0);
    const totalRetiradas = retiradasDoCaixa.reduce(
      (acc, retirada) => acc + Number(retirada.valor || 0),
      0
    );
    const valorEmCaixa =
      Number(item.fundoCaixa || 0) + totalDinheiro - totalRetiradas;

    await fecharCaixa(item.id, {
      totalVendas,
      totalItens,
      totalDinheiro,
      totalRetiradas,
      valorEmCaixa,
    });

    await carregarPeriodoAtual();
  }

  function iniciarEdicaoSaida(item) {
    setSaidaEditando(item);
    setSaidaForm({
      descricao: item.descricaoLinha || "",
      valor: String(item.valor ?? ""),
      data: item.data || dataHoje,
    });
  }

  function cancelarEdicaoSaida() {
    setSaidaEditando(null);
    setSaidaForm({ descricao: "", valor: "", data: "" });
  }

  async function salvarSaidaEditada(e) {
    e.preventDefault();
    if (!saidaEditando?.id) return;

    const valor = Number(saidaForm.valor || 0);
    if (!saidaForm.descricao.trim() || !Number.isFinite(valor) || valor <= 0 || !saidaForm.data) return;

    if (saidaEditando.tipoSaida === "despesa") {
      await updateDespesa(saidaEditando.id, {
        descricao: saidaForm.descricao,
        valor,
        data: saidaForm.data,
      });
    } else {
      await updateRetiradaCaixa(saidaEditando.id, {
        motivo: saidaForm.descricao,
        valor,
        data: saidaForm.data,
      });
    }

    cancelarEdicaoSaida();
    await carregarPeriodoAtual();
  }

  async function excluirSaida(item) {
    if (!item?.id) return;

    const confirmar = window.confirm(
      `Excluir ${String(item.origem || "saida").toLowerCase()} "${item.descricaoLinha}"?`
    );
    if (!confirmar) return;

    if (item.tipoSaida === "despesa") {
      await deleteDespesa(item.id);
    } else {
      await deleteRetiradaCaixa(item.id);
    }

    if (saidaEditando?.id === item.id) cancelarEdicaoSaida();
    await carregarPeriodoAtual();
  }

  async function exportarRelatorioPDF() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
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
    doc.text(`Periodo analisado: ${formatDateLabel(dataInicioFiltro)} ate ${formatDateLabel(dataFimFiltro)}`, 42, y - 2);
    y += 8;

    drawSummaryCard(doc, {
      x: 14,
      y,
      w: 58,
      h: 22,
      title: "ENTRADAS",
      value: formatMoney(resumoFinanceiro.entradas),
      fillColor: [232, 247, 237],
      textColor: [22, 101, 52],
    });
    drawSummaryCard(doc, {
      x: 76,
      y,
      w: 58,
      h: 22,
      title: "GASTOS",
      value: formatMoney(resumoFinanceiro.gastos),
      fillColor: [254, 242, 242],
      textColor: [185, 28, 28],
    });
    drawSummaryCard(doc, {
      x: 138,
      y,
      w: 58,
      h: 22,
      title: "EM CAIXA",
      value: formatMoney(resumoFinanceiro.emCaixa),
      fillColor: [237, 244, 255],
      textColor: [37, 99, 235],
    });
    y += 30;

    doc.setFontSize(12);
    doc.setTextColor(24, 33, 47);
    doc.text("Resumo financeiro", 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Indicador", "Valor"]],
      body: [
        ["Fundo de caixa", formatMoney(resumoFinanceiro.fundoCaixa)],
        ["Entradas", formatMoney(resumoFinanceiro.entradas)],
        ["Gastos", formatMoney(resumoFinanceiro.gastos)],
        ["Em caixa", formatMoney(resumoFinanceiro.emCaixa)],
        ["Resultado", formatMoney(resumoFinanceiro.resultado)],
      ],
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    });
    y = doc.lastAutoTable.finalY + 10;

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
    doc.text("Saidas do periodo", 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Data", "Tipo", "Descricao", "Valor"]],
      body: saidasPeriodo.length
        ? saidasPeriodo.map((item) => [
            formatDateLabel(item.data),
            item.origem,
            item.descricaoLinha,
            formatMoney(item.valor),
          ])
        : [["-", "-", "Nenhuma saida registrada no periodo.", "-"]],
      theme: "grid",
      headStyles: { fillColor: [220, 38, 38], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 3: { halign: "right", textColor: [185, 28, 28], fontStyle: "bold" } },
    });

    doc.save(`relatorio-${String(dataInicioFiltro || "").replaceAll("-", "")}-${String(dataFimFiltro || "").replaceAll("-", "")}.pdf`);
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
          <span className="section-subtitle">{formatDateLabel(dataHoje)}</span>
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
            <strong className="stat-value">{vendasHojeVinculadas.length}</strong>
          </div>
        </div>
        <div className="scroll-list">
          {vendasHojeVinculadas.map((item) => (
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
          {!vendasHojeVinculadas.length && <p className="empty-state">Nenhuma venda registrada hoje.</p>}
        </div>
      </div>

      <div className="stats-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Entradas</span>
          <strong className="stat-value positive">{formatMoney(resumoFinanceiro.entradas)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Gastos</span>
          <strong className="stat-value negative">{formatMoney(resumoFinanceiro.gastos)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Em caixa</span>
          <strong className="stat-value positive">
            {formatMoney(resumoFinanceiro.emCaixa)}
          </strong>
        </div>
      </div>

      <div className="stats-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Resultado</span>
          <strong className={`stat-value ${resumoFinanceiro.resultado >= 0 ? "positive" : "negative"}`}>
            {formatMoney(resumoFinanceiro.resultado)}
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
            <div className="section-title">Saidas do periodo</div>
          </div>
          <div className="scroll-list">
            {saidasPeriodo.map((item) => (
              <div className="list-row" key={`${item.origem}-${item.id}`}>
                <div>
                  <strong>{item.descricaoLinha}</strong>
                  <small>{formatDateLabel(item.data)} • {item.origem}</small>
                </div>
                <strong className="negative">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {!saidasPeriodo.length && !loading && <p className="empty-state">Nenhuma saida encontrada.</p>}
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
                {caixa.status === "aberto" ? (
                  <button
                    className="mini-btn"
                    type="button"
                    onClick={() => fecharCaixaManual(caixa)}
                  >
                    Fechar
                  </button>
                ) : (
                  <button
                    className="mini-btn danger"
                    type="button"
                    onClick={() => excluirCaixa(caixa)}
                  >
                    Excluir
                  </button>
                )}
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
