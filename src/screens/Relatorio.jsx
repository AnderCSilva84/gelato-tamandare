import { useEffect, useMemo, useRef, useState } from "react";
import { FiBarChart2 } from "react-icons/fi";
import { getPdfLogo } from "../utils/pdfLogo";
import {
  deleteCaixa,
  fecharCaixa,
  getCaixasAbertos,
  getCaixas,
  getRetiradas,
} from "../services/caixas";
import { getProdutos } from "../services/produtos";
import {
  deleteVenda,
  getDespesas,
  getEntradasConsolidadas,
  getVendas,
  getVendasPorCaixa,
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
  return `${dia}/${mes}/${ano}`;
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

function extractIsoDateFromValue(valor) {
  if (!valor) return "";

  if (typeof valor?.toDate === "function") {
    return valor.toDate().toLocaleDateString("en-CA");
  }

  if (valor instanceof Date) {
    return valor.toLocaleDateString("en-CA");
  }

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleDateString("en-CA");
}

function getCaixaReferenceDate(caixa) {
  return extractIsoDateFromValue(caixa?.abertoEm) || String(caixa?.data || "");
}

function mergeItemsById(items) {
  return Array.from(
    new Map(
      (items || [])
        .filter((item) => item?.id)
        .map((item) => [item.id, item])
    ).values()
  );
}

function buildVisibleCaixasForPeriod(caixasPeriodo, caixasAbertos, dataInicio, dataFim) {
  const caixasAbertosDoPeriodo = (caixasAbertos || []).filter((item) => {
    const dataAbertura = getCaixaReferenceDate(item);
    return dataAbertura && dataAbertura >= dataInicio && dataAbertura <= dataFim;
  });

  return mergeItemsById([...(caixasPeriodo || []), ...caixasAbertosDoPeriodo]);
}

function filterItemsByPeriod(items, dataInicio, dataFim) {
  return (items || []).filter((item) => {
    const dataItem = String(item?.data || "");
    return dataItem && dataItem >= dataInicio && dataItem <= dataFim;
  });
}

function normalizePeriodRange(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) {
    return {
      inicio: String(dataInicio || ""),
      fim: String(dataFim || ""),
    };
  }

  return dataInicio <= dataFim
    ? { inicio: dataInicio, fim: dataFim }
    : { inicio: dataFim, fim: dataInicio };
}

function isDateWithinPeriod(data, dataInicio, dataFim) {
  const dataNormalizada = String(data || "");
  return Boolean(dataNormalizada && dataNormalizada >= dataInicio && dataNormalizada <= dataFim);
}

function buildCaixasSummaryForPeriod(caixas, vendasPeriodo, retiradasPeriodo, dataInicio, dataFim) {
  const caixasComMovimento = new Set(
    [...(vendasPeriodo || []), ...(retiradasPeriodo || [])]
      .map((item) => String(item?.caixaId || "").trim())
      .filter(Boolean)
  );

  return (caixas || [])
    .filter((caixa) => {
      const dataOperacional = String(caixa?.data || "");
      const dataReferencia = getCaixaReferenceDate(caixa);
      return (
        caixasComMovimento.has(caixa.id) ||
        isDateWithinPeriod(dataOperacional, dataInicio, dataFim) ||
        isDateWithinPeriod(dataReferencia, dataInicio, dataFim)
      );
    })
    .map((caixa) => {
    const vendasDoCaixa = (vendasPeriodo || []).filter((item) => item.caixaId === caixa.id);
    const retiradasDoCaixa = (retiradasPeriodo || []).filter((item) => item.caixaId === caixa.id);

    return {
      ...caixa,
      totalVendasPeriodo: vendasDoCaixa.reduce((acc, item) => acc + Number(item.valor || 0), 0),
      totalItensPeriodo: vendasDoCaixa.reduce((acc, item) => acc + Number(item.quantidade || 0), 0),
      totalRetiradasPeriodo: retiradasDoCaixa.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    };
  });
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

function formatMonthLabel(valor) {
  const [ano, mes] = String(valor || "").split("-");
  if (!ano || !mes) return String(valor || "");
  return `${mes}/${ano}`;
}

function escapeCsvValue(valor) {
  const texto = String(valor ?? "");
  return `"${texto.replaceAll('"', '""')}"`;
}

function downloadTextFile(nomeArquivo, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

function buildMonthlySummary({ vendas = [], entradasConsolidadas = [], despesas = [], retiradas = [] }) {
  const mapa = new Map();

  function ensureMes(data) {
    const mes = mesDaData(data);
    if (!mes) return null;
    if (!mapa.has(mes)) {
      mapa.set(mes, {
        mes,
        entradasVendas: 0,
        entradasExtras: 0,
        despesas: 0,
        retiradas: 0,
      });
    }
    return mapa.get(mes);
  }

  vendas.forEach((item) => {
    const linha = ensureMes(item.data);
    if (!linha) return;
    linha.entradasVendas += Number(item.valor || 0);
  });

  entradasConsolidadas.forEach((item) => {
    const linha = ensureMes(item.data);
    if (!linha) return;
    linha.entradasExtras += Number(item.total || 0);
  });

  despesas.forEach((item) => {
    const linha = ensureMes(item.data);
    if (!linha) return;
    linha.despesas += Number(item.valor || 0);
  });

  retiradas.forEach((item) => {
    const linha = ensureMes(item.data);
    if (!linha) return;
    linha.retiradas += Number(item.valor || 0);
  });

  return Array.from(mapa.values())
    .map((item) => {
      const entradas = item.entradasVendas + item.entradasExtras;
      const gastos = item.despesas + item.retiradas;

      return {
        ...item,
        entradas,
        gastos,
        lucro: entradas - gastos,
      };
    })
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

export default function Relatorio({ uid, dataHoje, accessUser = null, loja = null }) {
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
  const [vendaCancelando, setVendaCancelando] = useState(null);
  const [senhaCancelamento, setSenhaCancelamento] = useState("");
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [feedbackCancelamento, setFeedbackCancelamento] = useState("");
  const [cancelandoVenda, setCancelandoVenda] = useState(false);
  const [reloadPeriodoKey, setReloadPeriodoKey] = useState(0);
  const periodoRequestRef = useRef(0);
  const periodoFiltro = useMemo(
    () => normalizePeriodRange(dataInicioFiltro, dataFimFiltro),
    [dataFimFiltro, dataInicioFiltro]
  );

  useEffect(() => {
    if (!uid || !periodoFiltro.inicio || !periodoFiltro.fim) return undefined;

    let ativo = true;
    const requestId = periodoRequestRef.current + 1;
    periodoRequestRef.current = requestId;

    async function carregarPeriodo() {
      setLoading(true);
      try {
        const [vendasData, despesasData, retiradasData, entradasConsolidadasData] = await Promise.all([
          getVendas(uid, periodoFiltro.inicio, periodoFiltro.fim),
          getDespesas(uid, periodoFiltro.inicio, periodoFiltro.fim),
          getRetiradas(uid, periodoFiltro.inicio, periodoFiltro.fim),
          getEntradasConsolidadas(uid, periodoFiltro.inicio, periodoFiltro.fim),
        ]);
        const [caixasPeriodo, caixasAbertos] = await Promise.all([
          getCaixas(uid, periodoFiltro.inicio, periodoFiltro.fim),
          getCaixasAbertos(uid),
        ]);
        const caixasData = buildVisibleCaixasForPeriod(
          caixasPeriodo,
          caixasAbertos,
          periodoFiltro.inicio,
          periodoFiltro.fim
        );
        const vendasDosCaixas = await Promise.all(
          caixasData.map((item) => getVendasPorCaixa(uid, item.id))
        );

        if (!ativo || periodoRequestRef.current !== requestId) return;

        const vendasPeriodo = filterItemsByPeriod(
          mergeItemsById([
            ...vendasData,
            ...filterItemsByPeriod(vendasDosCaixas.flat(), periodoFiltro.inicio, periodoFiltro.fim),
          ]),
          periodoFiltro.inicio,
          periodoFiltro.fim
        );
        const despesasPeriodo = filterItemsByPeriod(despesasData, periodoFiltro.inicio, periodoFiltro.fim);
        const retiradasPeriodo = filterItemsByPeriod(retiradasData, periodoFiltro.inicio, periodoFiltro.fim);
        const entradasPeriodo = filterItemsByPeriod(
          entradasConsolidadasData,
          periodoFiltro.inicio,
          periodoFiltro.fim
        );
        const caixasResumoPeriodo = buildCaixasSummaryForPeriod(
          caixasData,
          vendasPeriodo,
          retiradasPeriodo,
          periodoFiltro.inicio,
          periodoFiltro.fim
        );

        setVendas(vendasPeriodo);
        setDespesas(despesasPeriodo);
        setEntradasConsolidadas(entradasPeriodo);
        setRetiradas(retiradasPeriodo);
        setCaixas(caixasResumoPeriodo);
        setCaixaSelecionado((prev) =>
          prev ? caixasResumoPeriodo.find((item) => item.id === prev.id) || null : null
        );
      } catch (error) {
        console.error("Erro ao carregar relatorio:", error);
        if (!ativo || periodoRequestRef.current !== requestId) return;
        setVendas([]);
        setDespesas([]);
        setEntradasConsolidadas([]);
        setRetiradas([]);
        setCaixas([]);
        setCaixaSelecionado(null);
      } finally {
        if (ativo && periodoRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    }

    carregarPeriodo();

    return () => {
      ativo = false;
    };
  }, [periodoFiltro.fim, periodoFiltro.inicio, reloadPeriodoKey, uid]);

  useEffect(() => {
    let ativo = true;

    async function carregarVendasHoje() {
      if (!uid || !dataHoje) return;

      try {
        const [caixasPeriodo, caixasAbertos, vendasData] = await Promise.all([
          getCaixas(uid, dataHoje, dataHoje),
          getCaixasAbertos(uid),
          getVendas(uid, dataHoje, dataHoje),
        ]);
        const caixasVisiveis = buildVisibleCaixasForPeriod(
          caixasPeriodo,
          caixasAbertos,
          dataHoje,
          dataHoje
        );
        const vendasDosCaixas = await Promise.all(
          caixasVisiveis.map((item) => getVendasPorCaixa(uid, item.id))
        );
        if (!ativo) return;
        setVendasHoje(
          filterItemsByPeriod(
            mergeItemsById([
              ...vendasData,
              ...filterItemsByPeriod(vendasDosCaixas.flat(), dataHoje, dataHoje),
            ]),
            dataHoje,
            dataHoje
          )
        );
      } catch (error) {
        console.error("Erro ao carregar vendas de hoje no relatorio:", error);
        if (ativo) setVendasHoje([]);
      }
    }

    carregarVendasHoje();

    return () => {
      ativo = false;
    };
  }, [uid, dataHoje]);

  useEffect(() => {
    cancelarFluxoCancelamentoVenda();
  }, [caixaSelecionado?.id]);

  const resumoFinanceiro = useMemo(
    () => {
      return calcularResumoFinanceiro({
        vendas,
        despesas,
        retiradas,
        caixas,
        entradasConsolidadas,
      });
    },
    [caixas, despesas, entradasConsolidadas, retiradas, vendas]
  );
  const vendasPeriodoVisiveis = useMemo(() => vendas, [vendas]);
  const vendasCaixaSelecionado = useMemo(
    () =>
      caixaSelecionado?.id
        ? vendasPeriodoVisiveis.filter((item) => item.caixaId === caixaSelecionado.id)
        : [],
    [caixaSelecionado?.id, vendasPeriodoVisiveis]
  );
  const retiradasPeriodoVisiveis = useMemo(() => retiradas, [retiradas]);
  const despesasPeriodo = useMemo(
    () => [...despesas].sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))),
    [despesas]
  );
  const saidasPeriodo = useMemo(
    () =>
      [
        ...despesas.map((item) => ({
          ...item,
          descricaoLinha: item.descricao,
          origem: "Despesa",
          tipoSaida: "despesa",
        })),
        ...retiradasPeriodoVisiveis.map((item) => ({
          ...item,
          descricaoLinha: item.motivo || "Sangria de caixa",
          origem: "Retirada",
          tipoSaida: "retirada",
        })),
      ].sort((a, b) => String(b.data || "").localeCompare(String(a.data || ""))),
    [despesas, retiradasPeriodoVisiveis]
  );
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
  const vendasHojeVisiveis = useMemo(() => vendasHoje, [vendasHoje]);
  const vendasPorAtendente = useMemo(() => {
    const mapa = {};

    vendasPeriodoVisiveis.forEach((venda) => {
      const chave = venda.atendenteNome || venda.atendente || "Sem atendente";
      if (!mapa[chave]) {
        mapa[chave] = 0;
      }
      mapa[chave] += Number(venda.valor || 0);
    });

    return Object.entries(mapa)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [vendasPeriodoVisiveis]);
  const resumoMensal = useMemo(
    () =>
      buildMonthlySummary({
        vendas: vendasPeriodoVisiveis,
        entradasConsolidadas,
        despesas,
        retiradas: retiradasPeriodoVisiveis,
      }),
    [despesas, entradasConsolidadas, retiradasPeriodoVisiveis, vendasPeriodoVisiveis]
  );
  const podeCancelarVenda = isManagementRole(accessUser?.role) && caixaSelecionado?.status === "aberto";

  async function excluirCaixa(item) {
    if (!item?.id || item.status === "aberto") return;

    const confirmar = window.confirm(
      `Excluir o caixa de ${item.atendenteNome} em ${item.data}?`
    );
    if (!confirmar) return;

    await deleteCaixa(item.id, uid);
    setCaixaSelecionado((prev) => (prev?.id === item.id ? null : prev));
    setReloadPeriodoKey((prev) => prev + 1);
  }

  async function fecharCaixaManual(item) {
    if (!item?.id || item.status !== "aberto") return;

    const confirmar = window.confirm(
      `Fechar o caixa de ${item.atendenteNome} em ${item.data}?`
    );
    if (!confirmar) return;

    const vendasDoCaixa = await getVendasPorCaixa(uid, item.id);
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
    setReloadPeriodoKey((prev) => prev + 1);
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
      setReloadPeriodoKey((prev) => prev + 1);
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
    const produtos = await getProdutos(uid);
    const totalEstoque = produtos.reduce((acc, produto) => acc + Number(produto.estoque || 0), 0);
    const totalProdutosAtivos = produtos.filter((produto) => produto.ativo !== false).length;
    const valorEstoque = produtos.reduce(
      (acc, produto) => acc + Number(produto.precoFinal ?? produto.preco ?? 0) * Number(produto.estoque || 0),
      0
    );

    const doc = new jsPDF();
    let y = 18;

    try {
      const logo = await getPdfLogo(loja?.logomarca);
      if (logo) doc.addImage(logo.dataUrl, logo.format, 14, 10, 22, 22);
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
        ["Entradas do periodo", formatMoney(resumoFinanceiro.entradas)],
        ["Entradas manuais", formatMoney(resumoFinanceiro.entradasExtras)],
        ["Entradas por vendas", formatMoney(resumoFinanceiro.entradasVendas)],
        ["Despesas do periodo", formatMoney(resumoFinanceiro.despesasOperacionais)],
        ["Retiradas de caixa", formatMoney(resumoFinanceiro.retiradasCaixa)],
        ["Gastos do periodo", formatMoney(resumoFinanceiro.gastos)],
        ["Saldo do periodo", formatMoney(resumoFinanceiro.emCaixa)],
        ["Resultado do periodo", formatMoney(resumoFinanceiro.resultado)],
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

    doc.text("Resumo mensal do periodo", 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Mes", "Entradas", "Despesas", "Retiradas", "Lucro mensal"]],
      body: resumoMensal.length
        ? resumoMensal.map((item) => [
            formatMonthLabel(item.mes),
            formatMoney(item.entradas),
            formatMoney(item.despesas),
            formatMoney(item.retiradas),
            formatMoney(item.lucro),
          ])
        : [["-", "-", "-", "-", "-"]],
      theme: "grid",
      headStyles: { fillColor: [14, 116, 144], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right", fontStyle: "bold" },
      },
    });
    y = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.text("Entradas consolidadas do periodo", 14, y);
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
        : [["-", "-", "-", "-", "-"]],
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

    doc.setFontSize(12);
    doc.text("Despesas do periodo", 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Data", "Despesa", "Tipo", "Valor"]],
      body: despesasPeriodo.length
        ? despesasPeriodo.map((item) => [
            formatDateLabel(item.data),
            item.descricao || "-",
            item.despesaFixaDescricao ? "Fixa" : "Avulsa",
            formatMoney(item.valor),
          ])
        : [["-", "Nenhuma despesa encontrada no intervalo filtrado.", "-", "-"]],
      theme: "grid",
      headStyles: { fillColor: [220, 38, 38], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 3: { halign: "right", textColor: [185, 28, 28], fontStyle: "bold" } },
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
        : [["-", "-", "Nenhuma saida encontrada no intervalo filtrado.", "-"]],
      theme: "grid",
      headStyles: { fillColor: [220, 38, 38], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 3: { halign: "right", textColor: [185, 28, 28], fontStyle: "bold" } },
    });

    doc.save(`relatorio-${String(dataInicioFiltro || "").replaceAll("-", "")}-${String(dataFimFiltro || "").replaceAll("-", "")}.pdf`);
  }

  function exportarRelatorioCSV() {
    const linhas = [
      ["Secao", "Campo", "Valor"],
      ["Resumo", "Periodo inicial", formatDateLabel(dataInicioFiltro)],
      ["Resumo", "Periodo final", formatDateLabel(dataFimFiltro)],
      ["Resumo", "Entradas do periodo", formatMoney(resumoFinanceiro.entradas)],
      ["Resumo", "Entradas manuais", formatMoney(resumoFinanceiro.entradasExtras)],
      ["Resumo", "Entradas por vendas", formatMoney(resumoFinanceiro.entradasVendas)],
      ["Resumo", "Despesas do periodo", formatMoney(resumoFinanceiro.despesasOperacionais)],
      ["Resumo", "Retiradas", formatMoney(resumoFinanceiro.retiradasCaixa)],
      ["Resumo", "Gastos do periodo", formatMoney(resumoFinanceiro.gastos)],
      ["Resumo", "Saldo do periodo", formatMoney(resumoFinanceiro.emCaixa)],
      ["Resumo", "Resultado do periodo", formatMoney(resumoFinanceiro.resultado)],
      ["", "", ""],
      ["Resumo mensal do periodo", "Mes", "Entradas|Despesas|Retiradas|Resultado"],
      ...resumoMensal.map((item) => [
        "Resumo mensal do periodo",
        formatMonthLabel(item.mes),
        `${formatMoney(item.entradas)} | ${formatMoney(item.despesas)} | ${formatMoney(item.retiradas)} | ${formatMoney(item.lucro)}`,
      ]),
      ["", "", ""],
      ["Despesas do periodo", "Data", "Descricao|Tipo|Valor"],
      ...despesasPeriodo.map((item) => [
        "Despesas do periodo",
        formatDateLabel(item.data),
        `${item.descricao || "-"} | ${item.despesaFixaDescricao ? "Fixa" : "Avulsa"} | ${formatMoney(item.valor)}`,
      ]),
      ["", "", ""],
      ["Entradas consolidadas do periodo", "Data", "Dinheiro|Pix|Cartao|Total"],
      ...entradasConsolidadas.map((item) => [
        "Entradas consolidadas do periodo",
        formatDateLabel(item.data),
        `${formatMoney(item.dinheiro)} | ${formatMoney(item.pix)} | ${formatMoney(item.cartao)} | ${formatMoney(item.total)}`,
      ]),
    ];

    const csv = linhas
      .map((colunas) => colunas.map((coluna) => escapeCsvValue(coluna)).join(";"))
      .join("\n");

    downloadTextFile(
      `relatorio-${String(dataInicioFiltro || "").replaceAll("-", "")}-${String(dataFimFiltro || "").replaceAll("-", "")}.csv`,
      csv,
      "text/csv;charset=utf-8;"
    );
  }

  return (
    <div className="dashboard-screen">
      <div className="screen-heading section-card report-hero">
        <div>
          <h1 className="screen-title app-hero-title-blue screen-title-with-icon"><FiBarChart2 /> Relatório</h1>
          <p className="screen-description">Resumo de vendas, despesas e lucro por data.</p>
        </div>
        <span className="screen-badge">{formatDateLabel(dataHoje)}</span>
      </div>

      <div className="section-card filter-card">
        <div className="section-header">
          <div className="section-title">Filtro do periodo analisado</div>
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
          <button className="action-btn action-btn-secondary" type="button" onClick={exportarRelatorioCSV}>
            Exportar CSV
          </button>
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
            <strong className="stat-value">{vendasHojeVisiveis.length}</strong>
          </div>
        </div>
        <div className="scroll-list">
          {vendasHojeVisiveis.map((item) => (
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
          {!vendasHojeVisiveis.length && <p className="empty-state">Nenhuma venda registrada hoje.</p>}
        </div>
      </div>

      <div className="stats-grid report-result-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Entradas do periodo</span>
          <strong
            className={`stat-value ${resumoFinanceiro.entradas >= 0 ? "positive" : "negative"}`}
            style={{ color: resumoFinanceiro.entradas >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.entradas)}
          </strong>
          <small className="stat-note">Vendas + entradas consolidadas dentro do intervalo filtrado.</small>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Gastos do periodo</span>
          <strong
            className={`stat-value ${resumoFinanceiro.gastos >= 0 ? "positive" : "negative"}`}
            style={{ color: resumoFinanceiro.gastos >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.gastos)}
          </strong>
          <small className="stat-note">Despesas + retiradas dentro do intervalo filtrado.</small>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Saldo do periodo</span>
          <strong
            className={`stat-value ${resumoFinanceiro.emCaixa >= 0 ? "positive" : "negative"}`}
            style={{ color: resumoFinanceiro.emCaixa >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.emCaixa)}
          </strong>
          <small className="stat-note">Fundo + entradas - despesas - retiradas apenas do intervalo filtrado.</small>
        </div>
      </div>

      <div className="stats-grid report-summary-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Resultado do periodo</span>
          <strong
            className={`stat-value ${resumoFinanceiro.resultado >= 0 ? "positive" : "negative"}`}
            style={{ color: resumoFinanceiro.resultado >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.resultado)}
          </strong>
          <small className="stat-note">Entradas do periodo menos gastos do periodo.</small>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Despesas do periodo</span>
          <strong className="stat-value negative">{formatMoney(resumoFinanceiro.despesasOperacionais)}</strong>
          <small className="stat-note">Somatorio das despesas registradas dentro do intervalo filtrado.</small>
        </div>
      </div>

      <div className="screen-grid report-dual-grid report-grid-priority">
        <div className="section-card report-list-card report-card-caixas">
          <div className="section-header">
            <div className="section-title">Caixas com movimento no periodo</div>
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
                  {(() => {
                    const dataReferencia = getCaixaReferenceDate(caixa);

                    return (
                      <div>
                        <strong>
                          Caixa {caixa.atendenteNome} ({caixa.status === "aberto" ? "Aberto" : "Fechado"})
                        </strong>
                        <small>
                          {formatDateLabel(dataReferencia) || "Sem data"} - {Number(caixa.totalItensPeriodo || 0)} itens no periodo -{" "}
                          {caixa.status === "fechado" ? (
                            <>Fechado com <span className="positive">{formatMoney(caixa.totalVendasPeriodo || 0)}</span> no periodo</>
                          ) : (
                            <span className="positive">{formatMoney(caixa.totalVendasPeriodo || 0)}</span>
                          )}
                        </small>
                        <small>Abertura: {formatDateTimeLabel(caixa.abertoEm) || "Nao disponivel"}</small>
                        <small>
                          Fechamento: {caixa.status === "fechado" ? formatDateTimeLabel(caixa.fechadoEm) || "Nao disponivel" : "Em aberto"}
                        </small>
                      </div>
                    );
                  })()}
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
                : "Extrato do caixa no periodo"}
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
                  ? "Nenhuma venda desse caixa encontrada no intervalo filtrado."
                  : "Selecione um caixa para ver o extrato do intervalo filtrado."}
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
            {!vendas.length && !loading && <p className="empty-state">Nenhuma venda encontrada no intervalo filtrado.</p>}
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
            {!entradasConsolidadas.length && !loading && <p className="empty-state">Nenhuma entrada consolidada encontrada no intervalo filtrado.</p>}
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
            {!saidasPeriodo.length && !loading && <p className="empty-state">Nenhuma saida encontrada no intervalo filtrado.</p>}
          </div>
        </div>

        <div className="section-card report-list-card report-card-saidas">
          <div className="section-header">
            <div className="section-title">Resumo mensal do periodo</div>
          </div>
          <div className="scroll-list">
            {resumoMensal.map((item) => (
              <div className="list-row" key={item.mes}>
                <div>
                  <strong>{formatMonthLabel(item.mes)}</strong>
                  <small>
                    Entradas {formatMoney(item.entradas)} - Despesas {formatMoney(item.despesas)} - Retiradas{" "}
                    {formatMoney(item.retiradas)}
                  </small>
                </div>
                <strong className={item.lucro >= 0 ? "positive" : "negative"}>{formatMoney(item.lucro)}</strong>
              </div>
            ))}
            {!resumoMensal.length && !loading && <p className="empty-state">Nenhum resumo mensal encontrado para o intervalo filtrado.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

