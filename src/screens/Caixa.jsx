import { useEffect, useMemo, useState } from "react";
import logoGelato from "../assets/gelatoimg.jpeg";
import {
  abrirCaixa,
  addRetiradaCaixa,
  fecharCaixa,
  getCaixa,
  subscribeCaixa,
  subscribeRetiradasCaixa,
} from "../services/caixas";
import { subscribeAtendentes } from "../services/atendentes";
import { subscribeProdutos, updateProduto } from "../services/produtos";
import {
  addVenda,
  subscribeVendasPeriodo,
  subscribeVendasPorCaixa,
} from "../services/vendas";

const STORAGE_KEY = "gelato-caixa-atual";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(valor) {
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

function formatDateLabel(valor) {
  if (!valor) return "";
  const [ano, mes, dia] = String(valor).split("-");
  if (!ano || !mes || !dia) return String(valor);
  return `${dia}-${mes}-${ano}`;
}

function getProdutoImagem(produto) {
  return (
    produto?.imagem ||
    produto?.imagemUrl ||
    produto?.image ||
    produto?.imageUrl ||
    produto?.foto ||
    produto?.fotoUrl ||
    produto?.urlImagem ||
    ""
  );
}

function getProdutoPreco(produto) {
  return Number(produto?.precoFinal ?? produto?.preco ?? 0);
}

function buildRanking(vendas, atendentes) {
  const mapa = vendas.reduce((acc, venda) => {
    const id = String(venda?.atendenteId || venda?.atendente || "").trim();
    if (!id) return acc;

    if (!acc[id]) {
      acc[id] = {
        nome: venda?.atendenteNome || venda?.atendente || "Sem atendente",
        total: 0,
      };
    }

    acc[id].total += Number(venda?.valor || 0);
    return acc;
  }, {});
  const metas = Object.fromEntries(
    atendentes.map((atendente) => [atendente.id, Number(atendente.meta || 0)])
  );

  return Object.entries(mapa)
    .map(([id, item]) => ({
      id,
      nome: item?.nome || "Sem atendente",
      total: Number(item?.total || 0),
      meta: metas[id] || 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function readStoredSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  window.localStorage.removeItem(STORAGE_KEY);
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

function drawPdfBlock(doc, { x, y, w, h, title, subtitle, value, fillColor, valueColor }) {
  doc.setFillColor(...fillColor);
  doc.roundedRect(x, y, w, h, 5, 5, "F");
  doc.setDrawColor(220, 228, 240);
  doc.roundedRect(x, y, w, h, 5, 5);
  doc.setTextColor(99, 115, 140);
  doc.setFontSize(8);
  doc.text(title.toUpperCase(), x + 4, y + 6);
  if (subtitle) {
    doc.setFontSize(6.5);
    doc.text(subtitle, x + 4, y + 10);
  }
  doc.setTextColor(...valueColor);
  doc.setFontSize(15);
  doc.text(value, x + 4, y + 17);
}

function drawPdfSectionTitle(doc, title, y) {
  doc.setTextColor(24, 33, 47);
  doc.setFontSize(12);
  doc.text(title, 14, y);
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y + 2, 196, y + 2);
}

export default function Caixa({
  uid,
  dataHoje,
  accessRole = "atendente",
}) {
  const [produtos, setProdutos] = useState([]);
  const [atendentes, setAtendentes] = useState([]);
  const [caixaAtualId, setCaixaAtualId] = useState(() => readStoredSession()?.id || "");
  const [caixaAtual, setCaixaAtual] = useState(() => readStoredSession());
  const [vendasCaixa, setVendasCaixa] = useState([]);
  const [vendasRankingMes, setVendasRankingMes] = useState([]);
  const [retiradasCaixa, setRetiradasCaixa] = useState([]);
  const [salvandoVenda, setSalvandoVenda] = useState(false);
  const [salvandoRetirada, setSalvandoRetirada] = useState(false);
  const [abrindoSessao, setAbrindoSessao] = useState(false);
  const [fechandoSessao, setFechandoSessao] = useState(false);
  const [mostrandoFechamento, setMostrandoFechamento] = useState(false);
  const [mostrandoRetirada, setMostrandoRetirada] = useState(false);
  const [mostrandoResumoExpandido, setMostrandoResumoExpandido] = useState(false);
  const [toastVenda, setToastVenda] = useState("");
  const [feedbackVenda, setFeedbackVenda] = useState("");
  const [feedbackCaixa, setFeedbackCaixa] = useState("");
  const [feedbackRetirada, setFeedbackRetirada] = useState("");
  const [loginForm, setLoginForm] = useState({
    atendenteId: "",
    senha: "",
    fundoCaixa: "",
  });
  const [vendaForm, setVendaForm] = useState({
    produtoId: "",
    quantidade: 1,
    formaPagamento: "PIX",
    valorRecebido: "",
  });
  const [retiradaForm, setRetiradaForm] = useState({
    valor: "",
    motivo: "",
  });
  const [itensVenda, setItensVenda] = useState([]);

  useEffect(() => {
    const caixaSalvo = readStoredSession();
    if (!caixaSalvo?.id) return;

    getCaixa(caixaSalvo.id).then((caixa) => {
      if (caixa?.status === "aberto") {
        setCaixaAtualId(caixa.id);
        setCaixaAtual(caixa);
        writeStoredSession(caixa);
      } else {
        clearStoredSession();
      }
    });
  }, []);

  useEffect(() => {
    if (!uid) return;

    const unsubProdutos = subscribeProdutos(uid, setProdutos);
    const unsubAtendentes = subscribeAtendentes(uid, setAtendentes);
    const mesAtual = String(dataHoje || "").slice(0, 7);
    const dataInicioMes = `${mesAtual}-01`;
    const dataFimMes = `${mesAtual}-31`;
    const unsubRanking = subscribeVendasPeriodo(uid, dataInicioMes, dataFimMes, setVendasRankingMes);

    return () => {
      unsubProdutos();
      unsubAtendentes();
      unsubRanking();
    };
  }, [uid, dataHoje]);

  useEffect(() => {
    const unsub = subscribeCaixa(caixaAtualId, (caixa) => {
      if (!caixa || caixa.status !== "aberto") {
        setCaixaAtual(null);
        setCaixaAtualId("");
        setVendasCaixa([]);
        setRetiradasCaixa([]);
        setMostrandoResumoExpandido(false);
        clearStoredSession();
        return;
      }

      setCaixaAtual(caixa);
      writeStoredSession(caixa);
    });

    return () => unsub();
  }, [caixaAtualId]);

  useEffect(() => {
    const unsub = subscribeVendasPorCaixa(caixaAtualId, setVendasCaixa);
    return () => unsub();
  }, [caixaAtualId]);

  useEffect(() => {
    const unsub = subscribeRetiradasCaixa(
      caixaAtualId,
      setRetiradasCaixa,
      (error) => {
        if (error?.code === "permission-denied") {
          setFeedbackRetirada("Permissao negada no Firestore para ler as retiradas do caixa.");
        }
      }
    );
    return () => unsub();
  }, [caixaAtualId]);

  useEffect(() => {
    if (!toastVenda) return;
    const timeoutId = window.setTimeout(() => setToastVenda(""), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [toastVenda]);

  const produtosAtivos = useMemo(
    () => produtos.filter((item) => item.ativo !== false),
    [produtos]
  );
  const atendentesAtivos = useMemo(
    () => atendentes.filter((item) => item.ativo !== false),
    [atendentes]
  );
  const produtoSelecionado = useMemo(
    () => produtos.find((item) => item.id === vendaForm.produtoId),
    [produtos, vendaForm.produtoId]
  );
  const itensVendaDetalhados = useMemo(
    () =>
      itensVenda
        .map((item) => {
          const produto = produtos.find((entry) => entry.id === item.produtoId);
          if (!produto) return null;
          const precoUnitario = getProdutoPreco(produto);
          const quantidade = Number(item.quantidade || 0);

          return {
            ...item,
            produto,
            nome: produto.nome,
            precoUnitario,
            subtotal: precoUnitario * quantidade,
          };
        })
        .filter(Boolean),
    [itensVenda, produtos]
  );
  const atendenteLogado = useMemo(
    () => atendentes.find((item) => item.id === caixaAtual?.atendenteId) || null,
    [atendentes, caixaAtual]
  );
  const totalVendas = useMemo(
    () => vendasCaixa.reduce((acc, venda) => acc + Number(venda.valor || 0), 0),
    [vendasCaixa]
  );
  const totalVendasRankingMes = useMemo(
    () => vendasRankingMes.reduce((acc, venda) => acc + Number(venda.valor || 0), 0),
    [vendasRankingMes]
  );
  const totalItens = useMemo(
    () => vendasCaixa.reduce((acc, venda) => acc + Number(venda.quantidade || 0), 0),
    [vendasCaixa]
  );
  const ranking = useMemo(
    () => buildRanking(vendasRankingMes, atendentesAtivos),
    [vendasRankingMes, atendentesAtivos]
  );
  const resumoPagamentos = useMemo(() => {
    const totais = {
      PIX: 0,
      Dinheiro: 0,
      Debito: 0,
      Credito: 0,
    };

    vendasCaixa.forEach((venda) => {
      const forma = String(venda.formaPagamento || "");
      if (Object.hasOwn(totais, forma)) {
        totais[forma] += Number(venda.valor || 0);
      }
    });

    return totais;
  }, [vendasCaixa]);
  const fundoCaixaAtual = Number(caixaAtual?.fundoCaixa || 0);
  const totalRetiradas = useMemo(
    () => retiradasCaixa.reduce((acc, retirada) => acc + Number(retirada.valor || 0), 0),
    [retiradasCaixa]
  );
  const totalDisponivelEmCaixa = useMemo(
    () => fundoCaixaAtual + totalVendas - totalRetiradas,
    [fundoCaixaAtual, totalRetiradas, totalVendas]
  );
  const totalBruto = useMemo(
    () => fundoCaixaAtual + totalVendas,
    [fundoCaixaAtual, totalVendas]
  );
  const totalCarrinho = useMemo(
    () => itensVendaDetalhados.reduce((acc, item) => acc + Number(item.subtotal || 0), 0),
    [itensVendaDetalhados]
  );
  const quantidadeCarrinho = useMemo(
    () => itensVendaDetalhados.reduce((acc, item) => acc + Number(item.quantidade || 0), 0),
    [itensVendaDetalhados]
  );
  const valorRecebidoAtual = Number(vendaForm.valorRecebido || 0);
  const trocoAtual = useMemo(() => {
    if (vendaForm.formaPagamento !== "Dinheiro") return 0;
    return Math.max(valorRecebidoAtual - totalCarrinho, 0);
  }, [valorRecebidoAtual, totalCarrinho, vendaForm.formaPagamento]);

  function toggleRetiradaPanel() {
    setMostrandoRetirada((prev) => !prev);
    setFeedbackRetirada("");
  }

  function resetVendaForm() {
    setVendaForm({ produtoId: "", quantidade: 1, formaPagamento: "PIX", valorRecebido: "" });
    setItensVenda([]);
  }

  function adicionarItemVenda() {
    if (!produtoSelecionado) {
      setFeedbackVenda("Selecione um produto para adicionar.");
      return;
    }

    const quantidade = Number(vendaForm.quantidade || 0);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      setFeedbackVenda("Informe uma quantidade valida.");
      return;
    }

    const quantidadeNoCarrinho = itensVenda
      .filter((item) => item.produtoId === produtoSelecionado.id)
      .reduce((acc, item) => acc + Number(item.quantidade || 0), 0);
    const estoqueDisponivel = Number(produtoSelecionado.estoque || 0) - quantidadeNoCarrinho;

    if (estoqueDisponivel < quantidade) {
      setFeedbackVenda("Estoque insuficiente para adicionar esse item.");
      return;
    }

    setItensVenda((prev) => {
      const index = prev.findIndex((item) => item.produtoId === produtoSelecionado.id);
      if (index === -1) {
        return [...prev, { produtoId: produtoSelecionado.id, quantidade }];
      }

      return prev.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, quantidade: Number(item.quantidade || 0) + quantidade }
          : item
      );
    });
    setVendaForm((prev) => ({ ...prev, produtoId: "", quantidade: 1 }));
    setFeedbackVenda("");
  }

  function removerItemVenda(produtoId) {
    setItensVenda((prev) => prev.filter((item) => item.produtoId !== produtoId));
  }

  async function iniciarCaixa(e) {
    e.preventDefault();
    const atendente = atendentesAtivos.find((item) => item.id === loginForm.atendenteId);
    if (!atendente) return;
    const fundoCaixa = Number(loginForm.fundoCaixa || 0);

    const senhaCadastrada = String(atendente.senha || "");
    const senhaInformada = String(loginForm.senha || "");

    if (senhaCadastrada && senhaCadastrada !== senhaInformada) {
      setFeedbackCaixa("Senha invalida para abrir o caixa.");
      return;
    }
    if (!Number.isFinite(fundoCaixa) || fundoCaixa < 0) {
      setFeedbackCaixa("Informe um fundo de caixa valido.");
      return;
    }

    setAbrindoSessao(true);
    setFeedbackCaixa("");

    try {
      const docRef = await abrirCaixa(uid, {
        atendenteId: atendente.id,
        atendenteNome: atendente.nome,
        data: dataHoje,
        fundoCaixa,
      });

      const sessao = {
        id: docRef.id,
        atendenteId: atendente.id,
        atendenteNome: atendente.nome,
        data: dataHoje,
        fundoCaixa,
        status: "aberto",
      };

      writeStoredSession(sessao);
      setCaixaAtualId(docRef.id);
      setCaixaAtual(sessao);
      setLoginForm({ atendenteId: "", senha: "", fundoCaixa: "" });
      setFeedbackCaixa(`Caixa aberto para ${atendente.nome}.`);
    } catch {
      setFeedbackCaixa("Nao foi possivel abrir o caixa.");
    } finally {
      setAbrindoSessao(false);
    }
  }

  async function encerrarCaixa() {
    if (!caixaAtualId) return;

    setFechandoSessao(true);
    setFeedbackCaixa("");

    try {
      await fecharCaixa(caixaAtualId, {
        totalVendas,
        totalItens,
        totalDinheiro: resumoPagamentos.Dinheiro,
        totalRetiradas,
        valorEmCaixa: totalDisponivelEmCaixa,
      });
      clearStoredSession();
      setCaixaAtual(null);
      setCaixaAtualId("");
      setVendasCaixa([]);
      setRetiradasCaixa([]);
      setMostrandoFechamento(false);
      setMostrandoRetirada(false);
      setMostrandoResumoExpandido(false);
      resetVendaForm();
      setRetiradaForm({ valor: "", motivo: "" });
      setFeedbackCaixa("Caixa fechado com sucesso.");
    } catch {
      setFeedbackCaixa("Nao foi possivel fechar o caixa.");
    } finally {
      setFechandoSessao(false);
    }
  }

  async function exportarFechamentoPDF() {
    if (!caixaAtual) return;
    const { default: jsPDF } = await import("jspdf");

    const doc = new jsPDF();
    let y = 18;
    const horarioAbertura = formatDateTime(caixaAtual.abertoEm) || "Nao disponivel";
    const horarioFechamento = new Date().toLocaleString("pt-BR");
    const totalBruto = fundoCaixaAtual + totalVendas;
    const totalLiquido = totalDisponivelEmCaixa;
    const resumoCards = [
      {
        title: "Total bruto",
        subtitle: "fundo de caixa + vendas",
        value: formatMoney(totalBruto),
        fillColor: [232, 247, 237],
        valueColor: [22, 101, 52],
      },
      {
        title: "Saidas / retiradas",
        subtitle: "valores retirados do caixa",
        value: formatMoney(totalRetiradas),
        fillColor: [254, 242, 242],
        valueColor: [185, 28, 28],
      },
      {
        title: "Total liquido",
        subtitle: "bruto - saidas / retiradas",
        value: formatMoney(totalLiquido),
        fillColor: [237, 244, 255],
        valueColor: [37, 99, 235],
      },
    ];

    try {
      const logoDataUrl = await getLogoDataUrl();
      doc.addImage(logoDataUrl, "JPEG", 14, 10, 24, 24);
      y = 40;
    } catch {
      y = 18;
    }

    doc.setTextColor(24, 33, 47);
    doc.setFontSize(19);
    doc.text("Fechamento de Caixa", 14, y);
    doc.setFontSize(10);
    doc.setTextColor(99, 115, 140);
    doc.text(`Relatorio do turno • ${formatDateLabel(dataHoje)}`, 14, y + 7);

    y += 18;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, y, 182, 34, 6, 6, "F");
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y, 182, 34, 6, 6);
    doc.setFontSize(11);
    doc.setTextColor(24, 33, 47);
    doc.text(`Atendente: ${caixaAtual.atendenteNome}`, 18, y + 10);
    doc.text(`Data: ${formatDateLabel(dataHoje)}`, 112, y + 10);
    doc.text(`Abertura: ${horarioAbertura}`, 18, y + 21);
    doc.text(`Fechamento: ${horarioFechamento}`, 112, y + 21);

    y += 42;
    resumoCards.forEach((card, index) => {
      drawPdfBlock(doc, {
        x: 14 + index * 61.5,
        y,
        w: 57.5,
        h: 22,
        title: card.title,
        value: card.value,
        fillColor: card.fillColor,
        valueColor: card.valueColor,
      });
    });

    y += 30;
    drawPdfSectionTitle(doc, "Resumo operacional", y);
    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(24, 33, 47);
    doc.text(`Fundo de caixa: ${formatMoney(fundoCaixaAtual)}`, 14, y);
    doc.text(`Itens vendidos: ${String(totalItens)}`, 110, y);
    y += 7;
    doc.setTextColor(22, 101, 52);
    doc.text(`Total bruto: ${formatMoney(totalBruto)}`, 14, y);
    doc.setTextColor(185, 28, 28);
    doc.text(`Saidas / retiradas: ${formatMoney(totalRetiradas)}`, 110, y);
    y += 7;
    doc.setTextColor(37, 99, 235);
    doc.text(`Total liquido: ${formatMoney(totalLiquido)}`, 14, y);
    y += 11;

    drawPdfSectionTitle(doc, "Formas de pagamento", y);
    y += 10;
    [
      ["PIX", resumoPagamentos.PIX, [22, 101, 52]],
      ["Dinheiro", resumoPagamentos.Dinheiro, [37, 99, 235]],
      ["Debito", resumoPagamentos.Debito, [24, 33, 47]],
      ["Credito", resumoPagamentos.Credito, [24, 33, 47]],
    ].forEach(([label, valor, color], index) => {
      const x = 14 + (index % 2) * 92;
      const rowY = y + Math.floor(index / 2) * 14;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, rowY - 6, 84, 10, 4, 4, "F");
      doc.setTextColor(99, 115, 140);
      doc.setFontSize(9);
      doc.text(String(label), x + 4, rowY);
      doc.setTextColor(...color);
      doc.setFontSize(11);
      doc.text(formatMoney(valor), x + 80, rowY, { align: "right" });
    });
    y += 34;

    if (retiradasCaixa.length) {
      drawPdfSectionTitle(doc, "Retiradas do turno", y);
      y += 10;

      retiradasCaixa.forEach((retirada) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
          drawPdfSectionTitle(doc, "Retiradas do turno", y);
          y += 10;
        }

        doc.setFontSize(10);
        doc.setFillColor(254, 242, 242);
        doc.roundedRect(14, y - 5, 182, 10, 4, 4, "F");
        doc.setTextColor(24, 33, 47);
        doc.text(retirada.motivo || "Sangria", 18, y);
        doc.setTextColor(185, 28, 28);
        doc.text(formatMoney(retirada.valor), 192, y, { align: "right" });
        y += 12;
      });
    }

    drawPdfSectionTitle(doc, "Vendas do turno", y);
    y += 10;

    vendasCaixa.forEach((venda) => {
      if (y > 268) {
        doc.addPage();
        y = 20;
        drawPdfSectionTitle(doc, "Vendas do turno", y);
        y += 10;
      }

      doc.setFontSize(10);
      doc.setFillColor(240, 246, 255);
      doc.roundedRect(14, y - 5, 182, venda.formaPagamento === "Dinheiro" ? 16 : 10, 4, 4, "F");
      doc.setTextColor(24, 33, 47);
      doc.text(venda.produto, 18, y);
      doc.setTextColor(99, 115, 140);
      doc.text(`${venda.quantidade} un. • ${venda.formaPagamento || "Sem forma"}`, 18, y + 5);
      doc.setTextColor(22, 101, 52);
      doc.text(formatMoney(venda.valor), 192, y, { align: "right" });
      if (venda.formaPagamento === "Dinheiro") {
        doc.setTextColor(99, 115, 140);
        doc.text(
          `Recebido: ${formatMoney(venda.valorRecebido || 0)} | Troco: ${formatMoney(venda.troco || 0)}`,
          18,
          y + 10
        );
      }
      y += venda.formaPagamento === "Dinheiro" ? 18 : 12;
    });

    doc.save(`fechamento-caixa-${String(dataHoje || "").replaceAll("-", "")}.pdf`);
  }

  async function registrarVenda(e) {
    e.preventDefault();
    if (!caixaAtual || !atendenteLogado) return;
    if (!itensVendaDetalhados.length) {
      setFeedbackVenda("Adicione pelo menos um produto antes de finalizar.");
      return;
    }

    setSalvandoVenda(true);
    setFeedbackVenda("");

    try {
      const formaPagamento = vendaForm.formaPagamento;
      const valorRecebido = formaPagamento === "Dinheiro" ? Number(vendaForm.valorRecebido || 0) : 0;
      const troco = formaPagamento === "Dinheiro" ? Math.max(valorRecebido - totalCarrinho, 0) : 0;

      if (formaPagamento === "Dinheiro") {
        if (!Number.isFinite(valorRecebido) || valorRecebido < totalCarrinho) {
          setFeedbackVenda("Informe o valor recebido em dinheiro para calcular o troco.");
          setSalvandoVenda(false);
          return;
        }
      }

      for (const item of itensVendaDetalhados) {
        const estoqueAtual = Number(item.produto.estoque || 0);
        if (estoqueAtual < Number(item.quantidade || 0)) {
          throw new Error(`Estoque insuficiente para ${item.nome}.`);
        }
      }

      for (const item of itensVendaDetalhados) {
        await addVenda(uid, {
          produto: item.nome,
          produtoId: item.produto.id,
          valor: item.subtotal,
          quantidade: item.quantidade,
          atendente: atendenteLogado.nome,
          atendenteId: atendenteLogado.id,
          atendenteNome: atendenteLogado.nome,
          caixaId: caixaAtual.id,
          formaPagamento,
          valorRecebido: formaPagamento === "Dinheiro" ? valorRecebido : 0,
          troco: formaPagamento === "Dinheiro" ? troco : 0,
          data: dataHoje,
        });
        await updateProduto(item.produto.id, {
          estoque: Number(item.produto.estoque || 0) - Number(item.quantidade || 0),
        });
      }
      resetVendaForm();
      setToastVenda("Venda registrada com sucesso.");
    } catch (error) {
      setFeedbackVenda(error?.message || "Nao foi possivel registrar a venda.");
    } finally {
      setSalvandoVenda(false);
    }
  }

  async function registrarRetirada(e) {
    e.preventDefault();
    if (!caixaAtual || !atendenteLogado) return;

    const valor = Number(retiradaForm.valor || 0);
    const motivo = String(retiradaForm.motivo || "").trim();

    if (!Number.isFinite(valor) || valor <= 0) {
      setFeedbackRetirada("Informe um valor valido para a retirada.");
      return;
    }

    if (valor > totalDisponivelEmCaixa) {
      setFeedbackRetirada("A retirada nao pode ser maior que o dinheiro disponivel no caixa.");
      return;
    }

    setSalvandoRetirada(true);
    setFeedbackRetirada("");

    try {
      await addRetiradaCaixa(uid, {
        caixaId: caixaAtual.id,
        atendenteId: atendenteLogado.id,
        atendenteNome: atendenteLogado.nome,
        valor,
        motivo: motivo || "Sangria de caixa",
        data: dataHoje,
      });
      setRetiradaForm({ valor: "", motivo: "" });
      setMostrandoRetirada(false);
      setFeedbackRetirada("Retirada registrada com sucesso.");
    } catch (error) {
      if (error?.code === "permission-denied") {
        setFeedbackRetirada("Permissao negada no Firestore para registrar a retirada.");
      } else {
        setFeedbackRetirada("Nao foi possivel registrar a retirada.");
      }
    } finally {
      setSalvandoRetirada(false);
    }
  }

  return (
    <div className="dashboard-screen">
      <div className="pdv-hero section-card">
        <div className="pdv-hero-copy">
          <span className="pdv-eyebrow">Gelato Tamandare</span>
          <h1 className="screen-title">Registrar venda</h1>
          <p className="screen-description pdv-hero-description">
            Mantenha o foco na venda. Indicadores e acoes de conferencia ficam em segundo plano.
          </p>
        </div>
        <div className="pdv-hero-side">
          <span className="screen-badge">{formatDateLabel(dataHoje)}</span>
          {caixaAtual ? <span className="pdv-status-pill">Turno aberto</span> : null}
        </div>
      </div>

      {caixaAtual ? (
        <div className="section-card pdv-status-bar">
          <div className="pdv-status-bar-copy">
            <span className="stat-label">Atendente no caixa</span>
            <strong>{caixaAtual.atendenteNome}</strong>
            <small>Acoes administrativas do turno.</small>
          </div>
          <div className="pdv-status-bar-actions">
            <button
              className="action-btn action-btn-warning"
              type="button"
              onClick={toggleRetiradaPanel}
              >
                {mostrandoRetirada ? "Ocultar retirada" : "Nova retirada"}
              </button>
            <button
              className="action-btn action-btn-secondary"
              type="button"
              onClick={() => setMostrandoFechamento(true)}
              disabled={fechandoSessao}
            >
              {fechandoSessao ? "Fechando..." : "Fechar caixa"}
            </button>
          </div>
        </div>
      ) : null}

      <div className={`pdv-shell ${caixaAtual ? "is-open" : ""}`}>
        <div className="pdv-main-column">
          <div className="stats-grid pdv-stats-grid">
            {mostrandoResumoExpandido ? (
              <>
                <div className="section-card stat-card">
                  <span className="stat-label">Fundo inicial</span>
                  <small className="stat-note">entrada inicial do caixa</small>
                  <strong className="stat-value">{formatMoney(fundoCaixaAtual)}</strong>
                </div>
                <div className="section-card stat-card">
                  <span className="stat-label">Saidas / retiradas</span>
                  <small className="stat-note">valores retirados do caixa</small>
                  <strong className="stat-value negative">{formatMoney(totalRetiradas)}</strong>
                </div>
                <div className="section-card stat-card">
                  <span className="stat-label">Total bruto</span>
                  <small className="stat-note">fundo de caixa + vendas</small>
                  <strong className="stat-value positive">{formatMoney(totalBruto)}</strong>
                </div>
              </>
            ) : (
              <button
                className="section-card stat-card stat-card-toggle"
                type="button"
                onClick={() => setMostrandoResumoExpandido(true)}
                aria-expanded="false"
              >
                <span className="stat-label">Indicadores</span>
                <strong className="stat-value">Indicadores</strong>
              </button>
            )}
            <div className="section-card stat-card">
              <span className="stat-label">Itens no turno</span>
              <strong className="stat-value">{totalItens}</strong>
            </div>
            <div className="section-card stat-card">
              <span className="stat-label">Ticket medio turno</span>
              <strong className="stat-value">
                {formatMoney(totalItens ? totalVendas / totalItens : 0)}
              </strong>
            </div>
            <div className="section-card stat-card stat-card-highlight">
              <span className="stat-label">Total liquido</span>
              <small className="stat-note">bruto - saidas / retiradas</small>
              <strong className="stat-value positive">{formatMoney(totalDisponivelEmCaixa)}</strong>
            </div>
            {mostrandoResumoExpandido ? (
              <button
                className="section-card stat-card stat-card-toggle stat-card-toggle-close"
                type="button"
                onClick={() => setMostrandoResumoExpandido(false)}
                aria-expanded="true"
              >
                <span className="stat-label">Indicadores</span>
                <strong className="stat-value">Ocultar</strong>
              </button>
            ) : null}
          </div>

          {!caixaAtual ? (
            <div className="section-card pdv-card pdv-card-primary">
              <div className="section-header">
                <div className="section-title">Abrir caixa</div>
                <span className="section-subtitle">Entre com o atendente para iniciar o turno.</span>
              </div>
              <form className="stack-form" onSubmit={iniciarCaixa}>
                <select
                  className="input select pdv-input"
                  value={loginForm.atendenteId}
                  onChange={(e) =>
                    setLoginForm((prev) => ({ ...prev, atendenteId: e.target.value }))
                  }
                >
                  <option value="">Selecione o atendente</option>
                  {atendentesAtivos.map((atendente) => (
                    <option key={atendente.id} value={atendente.id}>
                      {atendente.nome}
                    </option>
                  ))}
                </select>

                <input
                  className="input pdv-input"
                  type="password"
                  value={loginForm.senha}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, senha: e.target.value }))}
                  placeholder="Senha do atendente"
                />

                <input
                  className="input pdv-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={loginForm.fundoCaixa}
                  onChange={(e) =>
                    setLoginForm((prev) => ({ ...prev, fundoCaixa: e.target.value }))
                  }
                  placeholder="Fundo de caixa inicial"
                />

                <button
                  className="action-btn action-btn-primary pdv-submit"
                  type="submit"
                  disabled={abrindoSessao}
                >
                  {abrindoSessao ? "Abrindo..." : "Entrar no caixa"}
                </button>

                {feedbackCaixa && <p className="inline-feedback">{feedbackCaixa}</p>}
              </form>
            </div>
          ) : (
            <div className="section-card pdv-card pdv-card-primary">
              <div className="section-header">
                <div className="section-title">Caixa aberto</div>
                <span className="section-subtitle">Atendente: {caixaAtual.atendenteNome}</span>
              </div>
              {mostrandoRetirada ? (
                <form className="stack-form pdv-retirada-card" onSubmit={registrarRetirada}>
                  <div className="pdv-retirada-head">
                    <div>
                      <strong>Retirada</strong>
                      <small>Sangria de valores do caixa</small>
                    </div>
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={toggleRetiradaPanel}
                    >
                      X
                    </button>
                  </div>
                  <input
                    className="input pdv-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={retiradaForm.valor}
                    onChange={(e) =>
                      setRetiradaForm((prev) => ({ ...prev, valor: e.target.value }))
                    }
                    placeholder="Valor da retirada"
                  />
                  <input
                    className="input pdv-input"
                    value={retiradaForm.motivo}
                    onChange={(e) =>
                      setRetiradaForm((prev) => ({ ...prev, motivo: e.target.value }))
                    }
                    placeholder="Motivo da sangria"
                  />
                  <div className="pdv-cash-summary">
                    <div className="pdv-cash-row">
                      <span>Disponivel no caixa</span>
                      <strong>{formatMoney(totalDisponivelEmCaixa)}</strong>
                    </div>
                  </div>
                  <button
                    className="action-btn action-btn-danger"
                    type="submit"
                    disabled={salvandoRetirada}
                  >
                    {salvandoRetirada ? "Registrando..." : "Confirmar retirada"}
                  </button>
                  {feedbackRetirada ? <p className="inline-feedback">{feedbackRetirada}</p> : null}
                </form>
              ) : null}

              <form className="stack-form" onSubmit={registrarVenda}>
                {produtoSelecionado && getProdutoImagem(produtoSelecionado) ? (
                  <div className="produto-preview">
                    <img
                      className="produto-preview-image"
                      src={getProdutoImagem(produtoSelecionado)}
                      alt={produtoSelecionado.nome}
                    />
                    <div className="produto-preview-info">
                      <strong>{produtoSelecionado.nome}</strong>
                      <small>{formatMoney(getProdutoPreco(produtoSelecionado))}</small>
                    </div>
                  </div>
                ) : null}

                <select
                  className="input select pdv-input"
                  value={vendaForm.produtoId}
                  onChange={(e) =>
                    setVendaForm((prev) => ({ ...prev, produtoId: e.target.value }))
                  }
                >
                  <option value="">Selecione um produto</option>
                  {produtosAtivos.map((produto) => (
                    <option key={produto.id} value={produto.id}>
                      {produto.nome} - {formatMoney(getProdutoPreco(produto))} - estoque {produto.estoque}
                    </option>
                  ))}
                </select>

                <input
                  className="input pdv-input"
                  type="number"
                  min="1"
                  value={vendaForm.quantidade}
                  onChange={(e) =>
                    setVendaForm((prev) => ({ ...prev, quantidade: e.target.value }))
                  }
                  placeholder="Quantidade"
                />

                <button
                  className="action-btn action-btn-secondary"
                  type="button"
                  onClick={adicionarItemVenda}
                  disabled={salvandoVenda}
                >
                  Adicionar produto
                </button>

                <select
                  className="input select pdv-input"
                  value={vendaForm.formaPagamento}
                  onChange={(e) =>
                    setVendaForm((prev) => ({
                      ...prev,
                      formaPagamento: e.target.value,
                      valorRecebido: e.target.value === "Dinheiro" ? prev.valorRecebido : "",
                    }))
                  }
                >
                  <option value="PIX">PIX</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Debito">Debito</option>
                  <option value="Credito">Credito</option>
                </select>

                {vendaForm.formaPagamento === "Dinheiro" ? (
                  <>
                    <input
                      className="input pdv-input"
                      type="number"
                      min={totalCarrinho || 0}
                      step="0.01"
                      value={vendaForm.valorRecebido}
                      onChange={(e) =>
                        setVendaForm((prev) => ({ ...prev, valorRecebido: e.target.value }))
                      }
                      placeholder="Valor recebido em dinheiro"
                    />
                    <div className="pdv-cash-summary">
                      <div className="pdv-cash-row">
                        <span>Total da venda</span>
                        <strong>{formatMoney(totalCarrinho)}</strong>
                      </div>
                      <div className="pdv-cash-row">
                        <span>Troco</span>
                        <strong>{formatMoney(trocoAtual)}</strong>
                      </div>
                    </div>
                  </>
                ) : null}

                <input className="input pdv-input" value={caixaAtual.atendenteNome} readOnly />

                <div className="pdv-item-actions">
                  <div className="pdv-cart-total">
                    <span>{quantidadeCarrinho} item(ns)</span>
                    <strong>{formatMoney(totalCarrinho)}</strong>
                  </div>
                </div>

                {itensVendaDetalhados.length ? (
                  <div className="pdv-cart-list">
                    {itensVendaDetalhados.map((item) => (
                      <div className="list-row pdv-cart-row" key={item.produtoId}>
                        <div>
                          <strong>{item.nome}</strong>
                          <small>
                            {item.quantidade} un. x {formatMoney(item.precoUnitario)}
                          </small>
                        </div>
                        <div className="pdv-cart-row-actions">
                          <strong className="positive">{formatMoney(item.subtotal)}</strong>
                          <button
                            className="mini-btn danger"
                            type="button"
                            onClick={() => removerItemVenda(item.produtoId)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <button
                  className="action-btn action-btn-primary pdv-submit"
                  type="submit"
                  disabled={salvandoVenda || !itensVendaDetalhados.length}
                >
                  {salvandoVenda ? "Salvando..." : "Finalizar venda"}
                </button>

                {feedbackVenda ? <p className="inline-feedback">{feedbackVenda}</p> : null}
                {feedbackCaixa && <p className="inline-feedback">{feedbackCaixa}</p>}
                {!mostrandoRetirada && feedbackRetirada ? (
                  <p className="inline-feedback">{feedbackRetirada}</p>
                ) : null}
              </form>
            </div>
          )}
        </div>

        {caixaAtual ? (
          <aside className="section-card pdv-sales-column">
            <div className="section-header">
              <div className="section-title">Vendas do turno</div>
              <span className="section-subtitle">{vendasCaixa.length} registros</span>
            </div>
            <div className="scroll-list pdv-sales-list">
              {vendasCaixa.map((venda) => (
                <div className="list-row pdv-sale-row" key={venda.id}>
                  <div>
                    <strong>{venda.produto}</strong>
                    <small>
                      {venda.quantidade} un. - {venda.formaPagamento || "Sem forma"}
                    </small>
                    {venda.formaPagamento === "Dinheiro" ? (
                      <small>
                        Recebido {formatMoney(venda.valorRecebido || 0)} - Troco {formatMoney(venda.troco || 0)}
                      </small>
                    ) : null}
                  </div>
                  <strong className="positive">{formatMoney(venda.valor)}</strong>
                </div>
              ))}
              {!vendasCaixa.length && (
                <p className="empty-state">Nenhuma venda registrada neste turno.</p>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {caixaAtual && mostrandoFechamento ? (
        <div className="section-card fechamento-card">
          <div className="section-header">
            <div className="section-title">Resumo de fechamento</div>
            <span className="section-subtitle">{caixaAtual.atendenteNome}</span>
          </div>

          <div className="stats-grid fechamento-grid">
            <div className="stat-card">
              <span className="stat-label">Fundo inicial</span>
              <small className="stat-note">entrada inicial do caixa</small>
              <strong className="stat-value">{formatMoney(fundoCaixaAtual)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Saidas / retiradas</span>
              <small className="stat-note">valores retirados do caixa</small>
              <strong className="stat-value negative">{formatMoney(totalRetiradas)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total bruto</span>
              <small className="stat-note">fundo de caixa + vendas</small>
              <strong className="stat-value positive">{formatMoney(totalBruto)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total liquido</span>
              <small className="stat-note">bruto - saidas / retiradas</small>
              <strong className="stat-value positive">{formatMoney(totalDisponivelEmCaixa)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Itens vendidos</span>
              <strong className="stat-value">{totalItens}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Registros</span>
              <strong className="stat-value">{vendasCaixa.length}</strong>
            </div>
          </div>

          <div className="fechamento-pagamentos">
            <div className="fechamento-pagamento">
              <span>PIX</span>
              <strong>{formatMoney(resumoPagamentos.PIX)}</strong>
            </div>
            <div className="fechamento-pagamento">
              <span>Dinheiro</span>
              <strong>{formatMoney(resumoPagamentos.Dinheiro)}</strong>
            </div>
            <div className="fechamento-pagamento">
              <span>Cartao de debito</span>
              <strong>{formatMoney(resumoPagamentos.Debito)}</strong>
            </div>
            <div className="fechamento-pagamento">
              <span>Cartao de credito</span>
              <strong>{formatMoney(resumoPagamentos.Credito)}</strong>
            </div>
          </div>

          {retiradasCaixa.length ? (
            <div className="scroll-list fechamento-lista">
              {retiradasCaixa.map((retirada) => (
                <div className="list-row" key={retirada.id}>
                  <div>
                    <strong>{retirada.motivo || "Sangria de caixa"}</strong>
                    <small>Retirada do turno</small>
                  </div>
                  <strong className="negative">{formatMoney(retirada.valor)}</strong>
                </div>
              ))}
            </div>
          ) : null}

          <div className="scroll-list fechamento-lista">
            {vendasCaixa.map((venda) => (
              <div className="list-row" key={venda.id}>
                <div>
                  <strong>{venda.produto}</strong>
                  <small>
                    {venda.quantidade} un. - {venda.formaPagamento || "Sem forma"}
                  </small>
                  {venda.formaPagamento === "Dinheiro" ? (
                    <small>
                      Recebido {formatMoney(venda.valorRecebido || 0)} - Troco {formatMoney(venda.troco || 0)}
                    </small>
                  ) : null}
                </div>
                <strong className="positive">{formatMoney(venda.valor)}</strong>
              </div>
            ))}
          </div>

          <div className="section-actions fechamento-actions">
            <button className="action-btn action-btn-danger" type="button" onClick={() => setMostrandoFechamento(false)}>
              Cancelar
            </button>
            <button className="action-btn action-btn-warning" type="button" onClick={exportarFechamentoPDF}>
              Exportar PDF
            </button>
            <button className="action-btn action-btn-primary" type="button" onClick={encerrarCaixa} disabled={fechandoSessao}>
              {fechandoSessao ? "Fechando..." : "Confirmar fechamento"}
            </button>
          </div>
        </div>
      ) : null}

      {toastVenda ? <div className="toast-popup">{toastVenda}</div> : null}

      {accessRole === "gerencia" ? (
      <div className="section-card ranking-card ranking-card-footer">
        <div className="section-header">
          <div className="section-title">Ranking do Mes</div>
          <span className="section-subtitle">
            {Number(totalVendasRankingMes || 0) > 0
              ? formatMoney(totalVendasRankingMes)
              : "Atualizacao em tempo real"}
          </span>
        </div>
        <div className="ranking-list">
          {ranking.map((item, index) => {
            const medalha =
              index === 0 ? "1o" : index === 1 ? "2o" : index === 2 ? "3o" : `${index + 1}o`;
            const meta = Number(item.meta || 0);
            const progresso = meta > 0 ? Math.min((item.total / meta) * 100, 100) : 0;
            const medalhaIcone = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "•";

            return (
              <div className={`ranking-item ${index === 0 ? "is-first" : ""}`} key={item.id}>
                <div className="ranking-head">
                  <div className="ranking-identity">
                    <span className="ranking-badge">
                      {medalhaIcone} {medalha}
                    </span>
                    <strong>{item.nome}</strong>
                  </div>
                  <span className="ranking-value">{formatMoney(item.total)}</span>
                </div>
                <div className="ranking-meta">
                  <small>
                    {formatMoney(item.total)} / {formatMoney(meta)}
                  </small>
                  <small>{Math.round(progresso)}% da meta</small>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progresso}%` }} />
                </div>
              </div>
            );
          })}
          {!ranking.length && <p className="empty-state">Nenhuma venda por atendente registrada neste mes.</p>}
        </div>
      </div>
      ) : null}
    </div>
  );
}
