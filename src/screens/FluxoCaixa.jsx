import { useCallback, useEffect, useMemo, useState } from "react";
import logoGelato from "../assets/gelatoimg.jpeg";
import { getCaixas, getRetiradas } from "../services/caixas";
import {
  addEntradaConsolidada,
  addDespesa,
  deleteEntradaConsolidada,
  deleteDespesa,
  getEntradasConsolidadas,
  getDespesas,
  getVendas,
  updateEntradaConsolidada,
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

async function loadPdfTools() {
  const [jsPdfModule, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const jsPDF = jsPdfModule?.jsPDF || jsPdfModule?.default;
  const autoTable = autoTableModule?.default || autoTableModule?.autoTable;

  if (!jsPDF || typeof autoTable !== "function") {
    throw new Error("Bibliotecas de PDF indisponiveis.");
  }

  return { jsPDF, autoTable };
}

function initialForm(data) {
  return {
    descricao: "",
    valor: "",
    data,
  };
}

function initialEntradaForm(data) {
  return {
    data,
    dinheiro: "",
    pix: "",
    cartao: "",
  };
}

export default function FluxoCaixa({ uid, dataHoje }) {
  const [modoFiltro, setModoFiltro] = useState("dia");
  const [dataFiltro, setDataFiltro] = useState(dataHoje);
  const [dataInicioFiltro, setDataInicioFiltro] = useState(dataHoje);
  const [dataFimFiltro, setDataFimFiltro] = useState(dataHoje);
  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [retiradas, setRetiradas] = useState([]);
  const [caixas, setCaixas] = useState([]);
  const [entradasConsolidadas, setEntradasConsolidadas] = useState([]);
  const [form, setForm] = useState(() => initialForm(dataHoje));
  const [editandoId, setEditandoId] = useState("");
  const [entradaForm, setEntradaForm] = useState(() => initialEntradaForm(dataHoje));
  const [entradaEditandoId, setEntradaEditandoId] = useState("");

  const filtroValido =
    modoFiltro === "dia"
      ? Boolean(dataFiltro)
      : Boolean(dataInicioFiltro && dataFimFiltro && dataInicioFiltro <= dataFimFiltro);

  const periodoReferencia =
    modoFiltro === "periodo"
      ? { inicio: dataInicioFiltro, fim: dataFimFiltro }
      : { inicio: dataFiltro, fim: dataFiltro };

  const carregarFluxo = useCallback(
    async (inicio, fim) => {
      if (!uid || !inicio || !fim) return;

      setLoading(true);
      try {
        const [vendasData, despesasData, retiradasData, caixasData, entradasConsolidadasData] = await Promise.all([
          getVendas(uid, inicio, fim),
          getDespesas(uid, inicio, fim),
          getRetiradas(inicio, fim),
          getCaixas(inicio, fim),
          getEntradasConsolidadas(uid, inicio, fim),
        ]);

        setVendas(vendasData);
        setDespesas(despesasData);
        setRetiradas(retiradasData);
        setCaixas(caixasData);
        setEntradasConsolidadas(entradasConsolidadasData);
      } catch (error) {
        console.error("Erro ao carregar fluxo de caixa:", error);
        setVendas([]);
        setDespesas([]);
        setRetiradas([]);
        setCaixas([]);
        setEntradasConsolidadas([]);
      } finally {
        setLoading(false);
      }
    },
    [uid]
  );

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      if (!uid) return;
      if (!filtroValido) {
        if (!ativo) return;
        setVendas([]);
        setDespesas([]);
        setRetiradas([]);
        setCaixas([]);
        setEntradasConsolidadas([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [vendasData, despesasData, retiradasData, caixasData, entradasConsolidadasData] = await Promise.all([
          getVendas(uid, periodoReferencia.inicio, periodoReferencia.fim),
          getDespesas(uid, periodoReferencia.inicio, periodoReferencia.fim),
          getRetiradas(periodoReferencia.inicio, periodoReferencia.fim),
          getCaixas(periodoReferencia.inicio, periodoReferencia.fim),
          getEntradasConsolidadas(uid, periodoReferencia.inicio, periodoReferencia.fim),
        ]);

        if (!ativo) return;
        setVendas(vendasData);
        setDespesas(despesasData);
        setRetiradas(retiradasData);
        setCaixas(caixasData);
        setEntradasConsolidadas(entradasConsolidadasData);
      } catch (error) {
        console.error("Erro ao carregar dados do fluxo de caixa:", error);
        if (!ativo) return;
        setVendas([]);
        setDespesas([]);
        setRetiradas([]);
        setCaixas([]);
        setEntradasConsolidadas([]);
      } finally {
        if (ativo) setLoading(false);
      }
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, [filtroValido, modoFiltro, dataFiltro, dataInicioFiltro, dataFimFiltro, periodoReferencia.fim, periodoReferencia.inicio, uid]);

  const resumoFinanceiro = useMemo(
    () =>
      calcularResumoFinanceiro({
        vendas,
        despesas,
        retiradas,
        caixas,
        entradasConsolidadas,
      }),
    [caixas, despesas, entradasConsolidadas, retiradas, vendas]
  );
  const saidasDoDia = useMemo(
    () =>
      [
        ...despesas.map((item) => ({ ...item, tipoSaida: "despesa" })),
        ...retiradas.map((item) => ({
          ...item,
          descricao: item.motivo || "Sangria de caixa",
          tipoSaida: "retirada",
        })),
      ].sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))),
    [despesas, retiradas]
  );

  const subtituloReferencia = useMemo(() => {
    if (modoFiltro === "periodo") {
      if (!dataInicioFiltro || !dataFimFiltro) return "Selecione o periodo";
      return `${formatDateLabel(dataInicioFiltro)} ate ${formatDateLabel(dataFimFiltro)}`;
    }

    return formatDateLabel(dataFiltro);
  }, [dataFiltro, dataFimFiltro, dataInicioFiltro, modoFiltro]);

  function despesaDentroDoFiltro(data) {
    if (!data) return false;
    if (modoFiltro === "periodo") {
      return data >= dataInicioFiltro && data <= dataFimFiltro;
    }
    return data === dataFiltro;
  }

  const caixasResumo = useMemo(
    () => ({
      abertos: caixas.filter((item) => item.status === "aberto").length,
      fechados: caixas.filter((item) => item.status === "fechado").length,
    }),
    [caixas]
  );
  const totalEntradaForm = useMemo(
    () =>
      Number(entradaForm.dinheiro || 0) +
      Number(entradaForm.pix || 0) +
      Number(entradaForm.cartao || 0),
    [entradaForm.cartao, entradaForm.dinheiro, entradaForm.pix]
  );

  async function salvarDespesa(e) {
    e.preventDefault();
    const dataDespesa = form.data;
    const valor = Number(form.valor || 0);
    if (!form.descricao.trim() || !Number.isFinite(valor) || valor <= 0 || !dataDespesa) return;

    if (editandoId) {
      await updateDespesa(editandoId, {
        descricao: form.descricao,
        valor,
        data: dataDespesa,
      });
    } else {
      await addDespesa(uid, {
        descricao: form.descricao,
        valor,
        data: dataDespesa,
      });
    }

    if (modoFiltro === "dia" && dataDespesa !== dataFiltro) {
      setDataFiltro(dataDespesa);
      setDataInicioFiltro(dataDespesa);
      setDataFimFiltro(dataDespesa);
    } else if (modoFiltro === "periodo" && !despesaDentroDoFiltro(dataDespesa)) {
      setModoFiltro("dia");
      setDataFiltro(dataDespesa);
      setDataInicioFiltro(dataDespesa);
      setDataFimFiltro(dataDespesa);
    } else {
      await carregarFluxo(periodoReferencia.inicio, periodoReferencia.fim);
    }

    setForm(initialForm(dataDespesa));
    setEditandoId("");
  }

  function editarDespesa(item) {
    setEditandoId(item.id);
    setForm({
      descricao: item.descricao || "",
      valor: String(item.valor ?? ""),
      data: item.data || dataFiltro,
    });
  }

  async function excluirDespesa(id) {
    await deleteDespesa(id);
    await carregarFluxo(periodoReferencia.inicio, periodoReferencia.fim);
  }

  async function exportarFluxoPDF() {
    try {
      const { jsPDF, autoTable } = await loadPdfTools();
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
      doc.text("Fluxo de Caixa", 42, y - 8);
      doc.setFontSize(11);
      doc.setTextColor(96, 112, 134);
      doc.text(
        modoFiltro === "periodo"
          ? `Periodo analisado: ${formatDateLabel(periodoReferencia.inicio)} ate ${formatDateLabel(periodoReferencia.fim)}`
          : `Data analisada: ${formatDateLabel(periodoReferencia.inicio)}`,
        42,
        y - 2
      );
      y += 8;

      drawSummaryCard(doc, {
        x: 14,
        y,
        w: 43,
        h: 22,
        title: "ENTRADAS",
        value: formatMoney(resumoFinanceiro.entradas),
        fillColor: [232, 247, 237],
        textColor: [22, 101, 52],
      });
      drawSummaryCard(doc, {
        x: 61,
        y,
        w: 43,
        h: 22,
        title: "GASTOS",
        value: formatMoney(resumoFinanceiro.gastos),
        fillColor: [254, 242, 242],
        textColor: [185, 28, 28],
      });
      drawSummaryCard(doc, {
        x: 108,
        y,
        w: 43,
        h: 22,
        title: "EM CAIXA",
        value: formatMoney(resumoFinanceiro.emCaixa),
        fillColor: [237, 244, 255],
        textColor: [37, 99, 235],
      });
      drawSummaryCard(doc, {
        x: 155,
        y,
        w: 41,
        h: 22,
        title: "RESULTADO",
        value: formatMoney(resumoFinanceiro.resultado),
        fillColor: resumoFinanceiro.resultado >= 0 ? [240, 253, 244] : [255, 241, 242],
        textColor: resumoFinanceiro.resultado >= 0 ? [22, 101, 52] : [190, 24, 93],
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

      doc.text("Caixas considerados", 14, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Indicador", "Valor"]],
        body: [
          ["Total de caixas", String(caixas.length)],
          ["Caixas abertos", String(caixasResumo.abertos)],
          ["Caixas fechados", String(caixasResumo.fechados)],
        ],
        theme: "grid",
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: { 1: { halign: "right" } },
      });
      y = doc.lastAutoTable.finalY + 10;

      doc.text("Entradas consolidadas", 14, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Data", "Dinheiro", "Pix", "Cartao", "Total"]],
        body: entradasConsolidadas.length
          ? entradasConsolidadas.map((item) => [
              formatDateLabel(item.data),
              formatMoney(item.dinheiro),
              formatMoney(item.pix),
              formatMoney(item.cartao),
              formatMoney(item.total),
            ])
          : [["-", "-", "-", "Nenhuma entrada consolidada.", "-"]],
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right", fontStyle: "bold" },
        },
      });
      y = doc.lastAutoTable.finalY + 10;

      doc.text("Saidas registradas", 14, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Data", "Tipo", "Descricao", "Valor"]],
        body: saidasDoDia.length
          ? saidasDoDia.map((item) => [
              formatDateLabel(item.data),
              item.tipoSaida === "retirada" ? "Retirada" : "Despesa",
              item.descricao,
              formatMoney(item.valor),
            ])
          : [["-", "-", "Nenhuma saida registrada.", "-"]],
        theme: "grid",
        headStyles: { fillColor: [220, 38, 38], textColor: 255 },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: { 3: { halign: "right", textColor: [185, 28, 28], fontStyle: "bold" } },
      });
      y = doc.lastAutoTable.finalY + 10;

      doc.text("Vendas registradas", 14, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Data", "Produto", "Qtd.", "Atendente", "Valor"]],
        body: vendas.length
          ? vendas.map((item) => [
              formatDateLabel(item.data),
              item.produto,
              String(item.quantidade || 0),
              item.atendenteNome || item.atendente || "-",
              formatMoney(item.valor),
            ])
          : [["-", "Nenhuma venda registrada.", "-", "-", "-"]],
        theme: "grid",
        headStyles: { fillColor: [22, 101, 52], textColor: 255 },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
          2: { halign: "center" },
          4: { halign: "right", textColor: [22, 101, 52], fontStyle: "bold" },
        },
      });
      y = doc.lastAutoTable.finalY + 10;

      doc.text("Caixas do periodo", 14, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Data", "Atendente", "Status", "Fundo", "Total vendas", "Em caixa"]],
        body: caixas.length
          ? caixas.map((item) => [
              formatDateLabel(item.data),
              item.atendenteNome || "-",
              item.status === "aberto" ? "Aberto" : "Fechado",
              formatMoney(item.fundoCaixa || 0),
              formatMoney(item.totalVendas || 0),
              formatMoney(item.valorEmCaixa || 0),
            ])
          : [["-", "-", "Nenhum caixa registrado.", "-", "-", "-"]],
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
        },
      });

      const sufixoArquivo =
        modoFiltro === "periodo"
          ? `${String(periodoReferencia.inicio || "").replaceAll("-", "")}-${String(periodoReferencia.fim || "").replaceAll("-", "")}`
          : String(periodoReferencia.inicio || "").replaceAll("-", "");
      doc.save(`fluxo-caixa-${sufixoArquivo}.pdf`);
    } catch (error) {
      console.error("Erro ao exportar PDF do fluxo de caixa:", error);
      window.alert("Nao foi possivel exportar o PDF do fluxo de caixa.");
    }
  }

  return (
    <div className="dashboard-screen">
      <div className="screen-heading">
        <div>
          <h1 className="screen-title app-hero-title-blue">Fluxo de caixa</h1>
          <p className="screen-description">
            Area administrativa para despesas, retiradas, saldos e conferencia diaria.
          </p>
        </div>
        <button className="action-btn action-btn-info" type="button" onClick={exportarFluxoPDF} disabled={!filtroValido || loading}>
          Exportar PDF
        </button>
      </div>

      <div className="section-card filter-card">
        <div className="section-header">
          <div className="section-title">Data de referencia</div>
          <span className="section-subtitle">{subtituloReferencia}</span>
        </div>
        <div className="section-actions">
          <button
            className={`action-btn ${modoFiltro === "dia" ? "action-btn-info" : "action-btn-secondary"}`}
            type="button"
            onClick={() => setModoFiltro("dia")}
          >
            Dia unico
          </button>
          <button
            className={`action-btn ${modoFiltro === "periodo" ? "action-btn-info" : "action-btn-secondary"}`}
            type="button"
            onClick={() => setModoFiltro("periodo")}
          >
            Entre datas
          </button>
        </div>
        {modoFiltro === "periodo" ? (
          <div className="stack-form">
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
            {!filtroValido ? <p className="empty-state">Defina um intervalo valido.</p> : null}
          </div>
        ) : (
          <input
            className="input"
            type="date"
            value={dataFiltro}
            onChange={(e) => {
              const novaData = e.target.value;
              setDataFiltro(novaData);
              setDataInicioFiltro(novaData);
              setDataFimFiltro(novaData);
              if (!editandoId) {
                setForm((prev) => ({ ...prev, data: novaData }));
              }
              if (!entradaEditandoId) {
                setEntradaForm((prev) => ({ ...prev, data: novaData }));
              }
            }}
          />
        )}
      </div>

      <div className="stats-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Entradas</span>
          <strong
            className={`stat-value ${resumoFinanceiro.entradas >= 0 ? "positive" : "negative"}`}
            style={{ color: resumoFinanceiro.entradas >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.entradas)}
          </strong>
          <small className="stat-note">Vendas + entradas consolidadas do dia.</small>
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

      <div className="stats-grid">
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

      <div className="screen-grid">
        <div className="section-card">
          <div className="section-header">
            <div className="section-title">
              {entradaEditandoId ? "Editar entrada consolidada" : "Nova entrada consolidada"}
            </div>
          </div>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const dataEntrada = entradaForm.data;
              const dinheiro = Number(entradaForm.dinheiro || 0);
              const pix = Number(entradaForm.pix || 0);
              const cartao = Number(entradaForm.cartao || 0);
              const total = dinheiro + pix + cartao;

              if (!dataEntrada || total <= 0) return;

              if (entradaEditandoId) {
                await updateEntradaConsolidada(entradaEditandoId, {
                  data: dataEntrada,
                  dinheiro,
                  pix,
                  cartao,
                });
              } else {
                await addEntradaConsolidada(uid, {
                  data: dataEntrada,
                  dinheiro,
                  pix,
                  cartao,
                });
              }

              if (modoFiltro === "dia" && dataEntrada !== dataFiltro) {
                setDataFiltro(dataEntrada);
                setDataInicioFiltro(dataEntrada);
                setDataFimFiltro(dataEntrada);
              } else if (modoFiltro === "periodo" && !despesaDentroDoFiltro(dataEntrada)) {
                setModoFiltro("dia");
                setDataFiltro(dataEntrada);
                setDataInicioFiltro(dataEntrada);
                setDataFimFiltro(dataEntrada);
              } else {
                await carregarFluxo(periodoReferencia.inicio, periodoReferencia.fim);
              }

              setEntradaForm(initialEntradaForm(dataEntrada));
              setEntradaEditandoId("");
            }}
          >
            <input
              className="input"
              type="date"
              value={entradaForm.data}
              onChange={(e) => setEntradaForm((prev) => ({ ...prev, data: e.target.value }))}
            />
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={entradaForm.dinheiro}
              onChange={(e) => setEntradaForm((prev) => ({ ...prev, dinheiro: e.target.value }))}
              placeholder="Dinheiro"
            />
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={entradaForm.pix}
              onChange={(e) => setEntradaForm((prev) => ({ ...prev, pix: e.target.value }))}
              placeholder="Pix"
            />
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={entradaForm.cartao}
              onChange={(e) => setEntradaForm((prev) => ({ ...prev, cartao: e.target.value }))}
              placeholder="Cartao (credito/debito)"
            />
            <input
              className="input"
              type="text"
              value={formatMoney(totalEntradaForm)}
              readOnly
              placeholder="Total de entradas"
            />
            <button className="action-btn action-btn-info" type="submit">
              {entradaEditandoId ? "Atualizar entrada" : "Registrar entrada"}
            </button>
          </form>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">
              {editandoId ? "Editar despesa" : "Nova despesa"}
            </div>
          </div>
          <form className="stack-form" onSubmit={salvarDespesa}>
            <input
              className="input"
              value={form.descricao}
              onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))}
              placeholder="Descricao"
            />
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.valor}
              onChange={(e) => setForm((prev) => ({ ...prev, valor: e.target.value }))}
              placeholder="Valor"
            />
            <input
              className="input"
              type="date"
              value={form.data}
              onChange={(e) => setForm((prev) => ({ ...prev, data: e.target.value }))}
            />
            <button className="action-btn action-btn-warning" type="submit">
              {editandoId ? "Atualizar despesa" : "Registrar despesa"}
            </button>
          </form>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">{modoFiltro === "periodo" ? "Saidas lancadas no periodo" : "Saidas lancadas"}</div>
            <span className="section-subtitle">
              {loading ? "Carregando..." : `${saidasDoDia.length} itens`}
            </span>
          </div>
          <div className="scroll-list">
            {saidasDoDia.map((item) => (
              <div className="list-row" key={`${item.tipoSaida}-${item.id}`}>
                <div>
                  <strong>{item.descricao}</strong>
                  <small>
                    {formatDateLabel(item.data)} • {item.tipoSaida === "retirada" ? "Retirada" : "Despesa"}
                  </small>
                </div>
                <div className="list-row-actions">
                  <strong className="negative">{formatMoney(item.valor)}</strong>
                  {item.tipoSaida === "despesa" ? (
                    <>
                      <button className="mini-btn" type="button" onClick={() => editarDespesa(item)}>
                        Editar
                      </button>
                      <button className="mini-btn danger" type="button" onClick={() => excluirDespesa(item.id)}>
                        Excluir
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
            {!saidasDoDia.length && !loading && (
              <p className="empty-state">
                {modoFiltro === "periodo"
                  ? "Nenhuma saida cadastrada nesse periodo."
                  : "Nenhuma saida cadastrada nessa data."}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="section-card">
        <div className="section-header">
          <div className="section-title">
            {modoFiltro === "periodo" ? "Entradas consolidadas do periodo" : "Entradas consolidadas"}
          </div>
          <span className="section-subtitle">
            {loading ? "Carregando..." : `${entradasConsolidadas.length} itens`}
          </span>
        </div>
        <div className="scroll-list">
          {entradasConsolidadas.map((item) => (
            <div className="list-row" key={item.id}>
              <div>
                <strong>{formatMoney(item.total || 0)}</strong>
                <small>
                  {formatDateLabel(item.data)} • Dinheiro {formatMoney(item.dinheiro)} • Pix {formatMoney(item.pix)} • Cartao{" "}
                  {formatMoney(item.cartao)}
                </small>
              </div>
              <div className="list-row-actions">
                <strong className="positive">{formatMoney(item.total)}</strong>
                <button
                  className="mini-btn"
                  type="button"
                  onClick={() => {
                    setEntradaEditandoId(item.id);
                    setEntradaForm({
                      data: item.data || dataFiltro,
                      dinheiro: String(item.dinheiro ?? ""),
                      pix: String(item.pix ?? ""),
                      cartao: String(item.cartao ?? ""),
                    });
                  }}
                >
                  Editar
                </button>
                <button
                  className="mini-btn danger"
                  type="button"
                  onClick={async () => {
                    await deleteEntradaConsolidada(item.id);
                    await carregarFluxo(periodoReferencia.inicio, periodoReferencia.fim);
                  }}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
          {!entradasConsolidadas.length && !loading && (
            <p className="empty-state">
              {modoFiltro === "periodo"
                ? "Nenhuma entrada consolidada cadastrada nesse periodo."
                : "Nenhuma entrada consolidada cadastrada nessa data."}
            </p>
          )}
        </div>
      </div>

      <div className="section-card">
        <div className="section-header">
          <div className="section-title">{modoFiltro === "periodo" ? "Vendas do periodo" : "Vendas da data"}</div>
          <span className="section-subtitle">{vendas.length} itens</span>
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
          {!vendas.length && !loading && (
            <p className="empty-state">
              {modoFiltro === "periodo"
                ? "Nenhuma venda encontrada nesse periodo."
                : "Nenhuma venda encontrada nessa data."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
