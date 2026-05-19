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
  deleteVenda,
  deleteDespesa,
  getDespesas,
  getEntradasConsolidadas,
  getVendas,
  getVendasPorCaixa,
  subscribeVendasDoDia,
  updateDespesa,
} from "../services/vendas";
import { criarLancamento } from "../services/lancamentos";
import { calcularResumoFinanceiro } from "../utils/financeiro";
import { isManagementRole } from "../utils/access";

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

function formatDateTimeLabel(valor) {
  if (!valor) return "";

  if (typeof valor?.toDate === "function") {
    return valor.toDate().toLocaleString("pt-BR");
  }

  if (valor instanceof Date) {
    return valor.toLocaleString("pt-BR");
  }

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleString("pt-BR");
}

function formatVendaHorario(venda) {
  const horario = String(venda?.horario || "").trim();
  if (horario) return horario;

  if (typeof venda?.criadoEm?.toDate === "function") {
    return venda.criadoEm.toDate().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (venda?.criadoEm instanceof Date) {
    return venda.criadoEm.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (typeof venda?.registradoEmMs === "number" && venda.registradoEmMs > 0) {
    return new Date(venda.registradoEmMs).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return "";
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

function mesDaData(data) {
  return String(data || "").slice(0, 7);
}

export default function Relatorio({ uid, dataHoje, accessUser = null }) {
  const [dataInicioFiltro, setDataInicioFiltro] = useState(dataHoje);
  const [dataFimFiltro, setDataFimFiltro] = useState(dataHoje);
  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState([]);
  const [vendasHoje, setVendasHoje] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [entradasConsolidadas, setEntradasConsolidadas] = useState([]);
  const [retiradas, setRetiradas] = useState([]);
  const [caixas, setCaixas] = useState([]);
  const [caixaSelecionado, setCaixaSelecionado] = useState(null);
  const [vendasCaixaSelecionado, setVendasCaixaSelecionado] = useState([]);
  const [saidaEditando, setSaidaEditando] = useState(null);
  const [saidaForm, setSaidaForm] = useState({ descricao: "", valor: "", data: "" });
  const [vendaCancelando, setVendaCancelando] = useState(null);
  const [senhaCancelamento, setSenhaCancelamento] = useState("");
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [feedbackCancelamento, setFeedbackCancelamento] = useState("");
  const [cancelandoVenda, setCancelandoVenda] = useState(false);

  const carregarPeriodoAtual = useCallback(async () => {
    setLoading(true);
    try {
      const [vendasData, despesasData, retiradasData, entradasConsolidadasData] = await Promise.all([
        getVendas(uid, dataInicioFiltro, dataFimFiltro),
        getDespesas(uid, dataInicioFiltro, dataFimFiltro),
        getRetiradas(dataInicioFiltro, dataFimFiltro),
        getEntradasConsolidadas(uid, dataInicioFiltro, dataFimFiltro),
      ]);
      const caixasData = await getCaixas(dataInicioFiltro, dataFimFiltro);

      setVendas(vendasData);
      setDespesas(despesasData);
      setEntradasConsolidadas(entradasConsolidadasData);
      setRetiradas(retiradasData);
      setCaixas(caixasData);
      setCaixaSelecionado((prev) =>
        prev ? caixasData.find((item) => item.id === prev.id) || null : null
      );
    } catch (error) {
      console.error("Erro ao carregar relatorio:", error);
      setVendas([]);
      setDespesas([]);
      setEntradasConsolidadas([]);
      setRetiradas([]);
      setCaixas([]);
      setCaixaSelecionado(null);
    } finally {
      setLoading(false);
    }
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

  useEffect(() => {
    cancelarFluxoCancelamentoVenda();
  }, [caixaSelecionado?.id]);

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
        entradasConsolidadas,
      });
    },
    [caixas, despesas, entradasConsolidadas, retiradas, vendas]
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
  const podeCancelarVenda = isManagementRole(accessUser?.role) && caixaSelecionado?.status === "aberto";

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

  function iniciarCancelamentoVenda(venda) {
    setVendaCancelando(venda);
    setSenhaCancelamento("");
    setMotivoCancelamento("");
    setFeedbackCancelamento("");
  }

  function cancelarFluxoCancelamentoVenda() {
    setVendaCancelando(null);
    setSenhaCancelamento("");
    setMotivoCancelamento("");
    setFeedbackCancelamento("");
    setCancelandoVenda(false);
  }

  async function confirmarCancelamentoVenda() {
    if (!vendaCancelando?.id || !caixaSelecionado?.id) return;
    if (caixaSelecionado.status !== "aberto") {
      setFeedbackCancelamento("So e possivel cancelar itens de caixa ainda aberto.");
      return;
    }

    const senhaCadastrada = String(accessUser?.senha || "");
    const senhaInformada = String(senhaCancelamento || "");
    const motivoInformado = String(motivoCancelamento || "").trim();

    if (!senhaCadastrada) {
      setFeedbackCancelamento("Cadastre uma senha para a gerencia antes de cancelar itens.");
      return;
    }

    if (senhaInformada !== senhaCadastrada) {
      setFeedbackCancelamento("Senha de gerencia invalida.");
      return;
    }

    if (!motivoInformado) {
      setFeedbackCancelamento("Informe o motivo do cancelamento.");
      return;
    }

    setCancelandoVenda(true);
    setFeedbackCancelamento("");

    try {
      await criarLancamento({
        uid,
        tipo: "cancelamento_venda_caixa",
        data: String(vendaCancelando.data || caixaSelecionado.data || dataHoje),
        mes: mesDaData(vendaCancelando.data || caixaSelecionado.data || dataHoje),
        descricao: `Cancelamento de item do caixa ${caixaSelecionado?.atendenteNome || ""}`.trim(),
        motivo: motivoInformado,
        valor: Number(vendaCancelando.valor || 0),
        caixaId: String(caixaSelecionado?.id || ""),
        vendaId: String(vendaCancelando.id || ""),
        produto: String(vendaCancelando.produto || ""),
        atendenteNome: String(vendaCancelando.atendenteNome || vendaCancelando.atendente || ""),
        autorizadoPor: String(accessUser?.nome || accessUser?.email || "Gerencia"),
      });
      await deleteVenda(vendaCancelando.id);
      cancelarFluxoCancelamentoVenda();
      await carregarPeriodoAtual();
    } catch {
      setFeedbackCancelamento("Nao foi possivel cancelar esse item da venda.");
      setCancelandoVenda(false);
    }
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
        ["Entradas manuais", formatMoney(resumoFinanceiro.entradasExtras)],
        ["Entradas por vendas", formatMoney(resumoFinanceiro.entradasVendas)],
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
      <div className="screen-heading section-card report-hero">
        <div>
          <h1 className="screen-title app-hero-title-blue">Relatório</h1>
          <p className="screen-description">Resumo de vendas, despesas e lucro por data.</p>
        </div>
        <span className="screen-badge">{formatDateLabel(dataHoje)}</span>
      </div>

      <div className="section-card filter-card">
        <div className="section-header">
          <div className="section-title">Filtro por periodo</div>
        </div>
        <div className="report-filter-grid">
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
        </div>
        <div className="section-actions report-filter-actions">
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
                  {item.quantidade} un. - {item.atendenteNome || item.atendente}
                </small>
              </div>
              <strong className="positive">{formatMoney(item.valor)}</strong>
            </div>
          ))}
          {!vendasHojeVinculadas.length && <p className="empty-state">Nenhuma venda registrada hoje.</p>}
        </div>
      </div>

      <div className="stats-grid report-result-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Entradas</span>
          <strong
            className={`stat-value ${resumoFinanceiro.entradas >= 0 ? "positive" : "negative"}`}
            style={{ color: resumoFinanceiro.entradas >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.entradas)}
          </strong>
          <small className="stat-note">Vendas + entradas consolidadas.</small>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Gastos</span>
          <strong
            className={`stat-value ${resumoFinanceiro.gastos >= 0 ? "positive" : "negative"}`}
            style={{ color: resumoFinanceiro.gastos >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.gastos)}
          </strong>
          <small className="stat-note">Despesas + retiradas.</small>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Em caixa</span>
          <strong
            className={`stat-value ${resumoFinanceiro.emCaixa >= 0 ? "positive" : "negative"}`}
            style={{ color: resumoFinanceiro.emCaixa >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.emCaixa)}
          </strong>
          <small className="stat-note">Fundo + entradas - despesas - retiradas.</small>
        </div>
      </div>

      <div className="stats-grid report-summary-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Resultado</span>
          <strong
            className={`stat-value ${resumoFinanceiro.resultado >= 0 ? "positive" : "negative"}`}
            style={{ color: resumoFinanceiro.resultado >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.resultado)}
          </strong>
          <small className="stat-note">Entradas - gastos.</small>
        </div>
      </div>

      <div className="screen-grid report-dual-grid report-grid-priority">
        <div className="section-card report-list-card report-card-caixas">
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
                      {caixa.data} - {Number(caixa.totalItens || 0)} itens -{" "}
                      {caixa.status === "fechado" ? (
                        <>Fechado com <span className="positive">{formatMoney(caixa.totalVendas || 0)}</span></>
                      ) : (
                        <span className="positive">{formatMoney(caixa.totalVendas || 0)}</span>
                      )}
                    </small>
                    <small>Abertura: {formatDateTimeLabel(caixa.abertoEm) || "Nao disponivel"}</small>
                    <small>
                      Fechamento: {caixa.status === "fechado" ? formatDateTimeLabel(caixa.fechadoEm) || "Nao disponivel" : "Em aberto"}
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

        <div className="section-card report-list-card report-card-extrato">
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
                    {formatVendaHorario(item) || "Sem horario"} - {item.quantidade} un. -{" "}
                    {item.formaPagamento || "Sem forma"} - {item.atendenteNome || item.atendente}
                  </small>
                </div>
                <div className="list-row-actions">
                  <strong className="positive">{formatMoney(item.valor)}</strong>
                  {podeCancelarVenda ? (
                    <button
                      className="mini-btn danger"
                      type="button"
                      onClick={() => iniciarCancelamentoVenda(item)}
                    >
                      Cancelar item
                    </button>
                  ) : null}
                </div>
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

        {vendaCancelando ? (
          <div className="section-card report-list-card report-card-extrato">
            <div className="section-header">
              <div className="section-title">Cancelar item do caixa</div>
              <span className="section-subtitle">{caixaSelecionado?.atendenteNome || "Caixa aberto"}</span>
            </div>
            <div className="stack-form">
              <p className="screen-description">
                Confirme com a senha da gerencia para cancelar <strong>{vendaCancelando.produto}</strong>.
              </p>
              <input
                className="input"
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                placeholder="Motivo do cancelamento"
              />
              <input
                className="input"
                type="password"
                value={senhaCancelamento}
                onChange={(e) => setSenhaCancelamento(e.target.value)}
                placeholder="Senha da gerencia"
              />
              <div className="section-actions">
                <button
                  className="action-btn action-btn-secondary"
                  type="button"
                  onClick={cancelarFluxoCancelamentoVenda}
                  disabled={cancelandoVenda}
                >
                  Fechar
                </button>
                <button
                  className="action-btn action-btn-danger"
                  type="button"
                  onClick={confirmarCancelamentoVenda}
                  disabled={cancelandoVenda}
                >
                  {cancelandoVenda ? "Cancelando..." : "Confirmar cancelamento"}
                </button>
              </div>
              {feedbackCancelamento ? <p className="inline-feedback">{feedbackCancelamento}</p> : null}
            </div>
          </div>
        ) : null}

        <div className="section-card report-list-card report-card-vendas">
          <div className="section-header">
            <div className="section-title">Vendas do periodo</div>
          </div>
          <div className="scroll-list">
            {vendas.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.produto}</strong>
                  <small>
                    {item.quantidade} un. - {item.atendenteNome || item.atendente}
                  </small>
                </div>
                <strong className="positive">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {!vendas.length && !loading && <p className="empty-state">Nenhuma venda encontrada.</p>}
          </div>
        </div>

        <div className="section-card report-list-card report-card-entradas">
          <div className="section-header">
            <div className="section-title">Entradas consolidadas do periodo</div>
          </div>
          <div className="scroll-list">
            {entradasConsolidadas.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{formatDateLabel(item.data)}</strong>
                  <small>
                    Dinheiro {formatMoney(item.dinheiro)} - Pix {formatMoney(item.pix)} - Cartao {formatMoney(item.cartao)}
                  </small>
                </div>
                <strong className="positive">{formatMoney(item.total)}</strong>
              </div>
            ))}
            {!entradasConsolidadas.length && !loading && <p className="empty-state">Nenhuma entrada consolidada encontrada.</p>}
          </div>
        </div>

        <div className="section-card report-list-card report-card-saidas">
          <div className="section-header">
            <div className="section-title">Saidas do periodo</div>
          </div>
          <div className="scroll-list">
            {saidasPeriodo.map((item) => (
              <div className="list-row" key={`${item.origem}-${item.id}`}>
                <div>
                  <strong>{item.descricaoLinha}</strong>
                  <small>{formatDateLabel(item.data)} - {item.origem}</small>
                </div>
                <strong className="negative">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {!saidasPeriodo.length && !loading && <p className="empty-state">Nenhuma saida encontrada.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

