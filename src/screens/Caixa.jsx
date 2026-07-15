import { useCallback, useEffect, useMemo, useState } from "react";
import { getPdfLogo } from "../utils/pdfLogo";
import {
  abrirCaixa,
  addRetiradaCaixa,
  fecharCaixa,
  getCaixa,
  getRetiradas,
  subscribeCaixa,
  subscribeCaixasPeriodo,
  subscribeRetiradasCaixa,
  updateCaixaData,
} from "../services/caixas";
import { subscribeAtendentes } from "../services/atendentes";
import { subscribeGruposProdutos } from "../services/gruposProdutos";
import { subscribeProdutos, updateProduto } from "../services/produtos";
import { isManagementRole } from "../utils/access";
import { hojeISO } from "../services/lancamentos";
import {
  addVenda,
  getVendasPorCaixa,
  subscribeVendasPeriodo,
  subscribeVendasPorCaixa,
} from "../services/vendas";
import { imprimirComprovanteTermico } from "../services/comprovanteTermico";

const STORAGE_KEY = "gelato-caixa-atual";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parseDecimalInput(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor ?? "").trim();
  if (!texto) return 0;
  const normalizado = texto.includes(",")
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
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

function formatDateLabel(valor) {
  if (!valor) return "";
  const [ano, mes, dia] = String(valor).split("-");
  if (!ano || !mes || !dia) return String(valor);
  return `${dia}/${mes}/${ano}`;
}

function formatMonthLabel(valor) {
  const [ano, mes] = String(valor || "").split("-");
  if (!ano || !mes) return "Mes atual";
  return new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function buildMonthPeriod(valor) {
  const [ano, mes] = String(valor || "").split("-");
  if (!ano || !mes) return { inicio: "", fim: "" };
  return {
    inicio: `${ano}-${mes}-01`,
    fim: `${ano}-${mes}-31`,
  };
}

function getPreviousMonthKey(valor) {
  const [ano, mes] = String(valor || "").split("-");
  if (!ano || !mes) return "";

  const referencia = new Date(Number(ano), Number(mes) - 1, 1);
  referencia.setMonth(referencia.getMonth() - 1);

  return `${referencia.getFullYear()}-${String(referencia.getMonth() + 1).padStart(2, "0")}`;
}

function getMetaForMonth(atendente, mesReferencia) {
  return Number(atendente?.metasMensais?.[mesReferencia] ?? atendente?.meta ?? 0);
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

function getProdutoPrecoKg(produto) {
  const precoVenda = Number(produto?.precoFinal ?? produto?.preco ?? 0);
  if (precoVenda > 0) return precoVenda;
  return Number(produto?.precoCusto || 0);
}

function getProdutoUnidadeVenda(produto) {
  return String(produto?.unidadeVenda || "un").trim().toLowerCase() === "kg" ? "kg" : "un";
}

function isProdutoPorPeso(produto) {
  return getProdutoUnidadeVenda(produto) === "kg";
}

function formatQuantidadeVenda(quantidade, unidadeVenda = "un") {
  const valor = Number(quantidade || 0);
  if (unidadeVenda === "kg") {
    return `${valor.toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    })} kg`;
  }

  return `${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} un.`;
}

const CATEGORY_LABELS = {
  todos: "Todos",
  bebidas: "Bebidas",
  lanches: "Lanches",
  refeicoes: "Refeicoes",
  sobremesas: "Sobremesas",
  outros: "Outros",
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function inferProductCategory(produto) {
  const explicit = normalizeText(
    produto?.categoria || produto?.grupo || produto?.tipo || produto?.section
  );

  if (explicit) {
    if (explicit.includes("beb")) return "bebidas";
    if (explicit.includes("lanch")) return "lanches";
    if (explicit.includes("sobrem") || explicit.includes("doce") || explicit.includes("sorv"))
      return "sobremesas";
    if (explicit.includes("refei") || explicit.includes("prato") || explicit.includes("almoco"))
      return "refeicoes";
  }

  const nome = normalizeText(produto?.nome);

  if (
    /(agua|suco|refrigerante|coca|cafe|cerveja|vinho|cha|milk shake|vitamina|energetico)/.test(
      nome
    )
  ) {
    return "bebidas";
  }

  if (
    /(hamburg|burger|pizza|coxinha|empada|pastel|sanduiche|lanche|pao|risole|hot dog|tapioca)/.test(
      nome
    )
  ) {
    return "lanches";
  }

  if (
    /(prato|refeicao|almoco|janta|file|salmao|picanha|frango|carne|salada|self service)/.test(
      nome
    )
  ) {
    return "refeicoes";
  }

  if (
    /(sorvete|acai|pudim|bolo|brigadeiro|brownie|mousse|sobremesa|picole|chocolate)/.test(
      nome
    )
  ) {
    return "sobremesas";
  }

  return "outros";
}

function buildRanking(vendas, atendentes, mesReferencia) {
  const metas = Object.fromEntries(
    atendentes.map((atendente) => [atendente.id, getMetaForMonth(atendente, mesReferencia)])
  );
  const mapaInicial = atendentes.reduce((acc, atendente) => {
    acc[atendente.id] = {
      nome: atendente?.nome || "Sem atendente",
      total: 0,
    };
    return acc;
  }, {});
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
  }, mapaInicial);

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

function canRestoreStoredSession(session, accessUserId, accessRole) {
  if (!session?.id || !accessUserId) return false;

  if (session.accessUserId && session.accessUserId !== accessUserId) {
    return false;
  }

  if (session.accessRole && session.accessRole !== accessRole) {
    return false;
  }

  if (!session.accessUserId && session.atendenteId && session.atendenteId !== accessUserId) {
    return false;
  }

  return true;
}

function bindStoredSession(session, accessUserId, accessRole) {
  return {
    ...session,
    accessUserId: accessUserId || "",
    accessRole,
  };
}

async function syncCaixaDateWithOpening(caixa) {
  const dataAbertura = extractIsoDateFromValue(caixa?.abertoEm);
  const dataRegistrada = String(caixa?.data || "").trim();

  if (!caixa?.id || !dataAbertura || dataRegistrada === dataAbertura) {
    return caixa;
  }

  await updateCaixaData(caixa.id, dataAbertura);
  return {
    ...caixa,
    data: dataAbertura,
  };
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
  accessUser = null,
  loja = null,
  compactMode = false,
}) {
  const [produtos, setProdutos] = useState([]);
  const [atendentes, setAtendentes] = useState([]);
  const [gruposProdutos, setGruposProdutos] = useState([]);
  const [caixaAtualId, setCaixaAtualId] = useState("");
  const [caixaAtual, setCaixaAtual] = useState(null);
  const [vendasCaixa, setVendasCaixa] = useState([]);
  const [vendasRankingMes, setVendasRankingMes] = useState([]);
  const [caixasRankingMes, setCaixasRankingMes] = useState([]);
  const [caixasGerenciaDia, setCaixasGerenciaDia] = useState([]);
  const [caixasDoDia, setCaixasDoDia] = useState([]);
  const [retiradasCaixa, setRetiradasCaixa] = useState([]);
  const [salvandoVenda, setSalvandoVenda] = useState(false);
  const [salvandoRetirada, setSalvandoRetirada] = useState(false);
  const [abrindoSessao, setAbrindoSessao] = useState(false);
  const [fechandoSessao, setFechandoSessao] = useState(false);
  const [mostrandoFechamento, setMostrandoFechamento] = useState(false);
  const [mostrandoRetirada, setMostrandoRetirada] = useState(false);
  const [mostrandoResumoExpandido, setMostrandoResumoExpandido] = useState(false);
  const [categoriaAtiva, setCategoriaAtiva] = useState("todos");
  const [buscaProduto, setBuscaProduto] = useState("");
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
    data: dataHoje,
  });
  const [retiradaForm, setRetiradaForm] = useState({
    valor: "",
    motivo: "",
  });
  const [itensVenda, setItensVenda] = useState([]);
  const [rankingMesSelecionado, setRankingMesSelecionado] = useState(() =>
    String(dataHoje || "").slice(0, 7)
  );

  function resetCaixaState() {
    setCaixaAtual(null);
    setCaixaAtualId("");
    setVendasCaixa([]);
    setRetiradasCaixa([]);
    setMostrandoResumoExpandido(false);
  }

  useEffect(() => {
    const caixaSalvo = readStoredSession();
    if (!accessUser?.id) {
      resetCaixaState();
      return;
    }

    if (!canRestoreStoredSession(caixaSalvo, accessUser.id, accessRole)) {
      resetCaixaState();
      return;
    }

    getCaixa(caixaSalvo.id).then(async (caixa) => {
      if (caixa?.status === "aberto") {
        const caixaSincronizado = await syncCaixaDateWithOpening(caixa);
        const sessao = bindStoredSession(caixaSincronizado, accessUser.id, accessRole);
        setCaixaAtualId(caixaSincronizado.id);
        setCaixaAtual(sessao);
        writeStoredSession(sessao);
      } else {
        clearStoredSession();
        resetCaixaState();
      }
    });
  }, [accessRole, accessUser?.id]);

  useEffect(() => {
    if (!uid) return;

    const unsubProdutos = subscribeProdutos(uid, setProdutos);
    const unsubAtendentes = subscribeAtendentes(uid, setAtendentes);
    const unsubGrupos = subscribeGruposProdutos(uid, setGruposProdutos);
    let unsubRanking = () => {};
    let unsubCaixasRanking = () => {};

    if (!compactMode) {
      const periodoRanking = buildMonthPeriod(rankingMesSelecionado || String(dataHoje || "").slice(0, 7));
      unsubRanking = subscribeVendasPeriodo(
        uid,
        periodoRanking.inicio,
        periodoRanking.fim,
        setVendasRankingMes
      );
      unsubCaixasRanking = subscribeCaixasPeriodo(uid,
        periodoRanking.inicio,
        periodoRanking.fim,
        setCaixasRankingMes
      );
    }

    return () => {
      unsubProdutos();
      unsubAtendentes();
      unsubGrupos();
      unsubRanking();
      unsubCaixasRanking();
    };
  }, [uid, dataHoje, rankingMesSelecionado, compactMode]);

  useEffect(() => {
    if (!rankingMesSelecionado && dataHoje) {
      setRankingMesSelecionado(String(dataHoje).slice(0, 7));
    }
  }, [dataHoje, rankingMesSelecionado]);

  useEffect(() => {
    if (!dataHoje) {
      setCaixasDoDia([]);
      return;
    }

    const unsub = subscribeCaixasPeriodo(uid, dataHoje, dataHoje, setCaixasDoDia);
    return () => unsub();
  }, [dataHoje, uid]);

  useEffect(() => {
    if (!isManagementRole(accessRole)) {
      setCaixasGerenciaDia([]);
      return;
    }

    setCaixasGerenciaDia(caixasDoDia);
  }, [accessRole, caixasDoDia]);

  useEffect(() => {
    setVendaForm((prev) => {
      if (prev.data === dataHoje) return prev;
      if (!isManagementRole(accessRole)) {
        return { ...prev, data: dataHoje };
      }
      return prev.data ? prev : { ...prev, data: dataHoje };
    });
  }, [accessRole, dataHoje]);

  useEffect(() => {
    if (!caixaAtualId) return () => {};

    const unsub = subscribeCaixa(caixaAtualId, async (caixa) => {
      if (!caixa || caixa.status !== "aberto") {
        resetCaixaState();
        clearStoredSession();
        return;
      }

      const caixaSincronizado = await syncCaixaDateWithOpening(caixa);
      const sessao = bindStoredSession(caixaSincronizado, accessUser?.id, accessRole);
      setCaixaAtual(sessao);
      writeStoredSession(sessao);
    });

    return () => unsub();
  }, [accessRole, accessUser?.id, caixaAtualId]);

  useEffect(() => {
    const unsub = subscribeVendasPorCaixa(uid, caixaAtualId, setVendasCaixa);
    return () => unsub();
  }, [caixaAtualId, uid]);

  useEffect(() => {
    const unsub = subscribeRetiradasCaixa(
      uid,
      caixaAtualId,
      setRetiradasCaixa,
      (error) => {
        if (error?.code === "permission-denied") {
          setFeedbackRetirada("Permissao negada no Firestore para ler as retiradas do caixa.");
        }
      }
    );
    return () => unsub();
  }, [caixaAtualId, uid]);

  useEffect(() => {
    if (!toastVenda) return;
    const timeoutId = window.setTimeout(() => setToastVenda(""), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [toastVenda]);

  const produtosAtivos = useMemo(
    () => produtos.filter((item) => item.ativo !== false),
    [produtos]
  );
  const gruposVisiveis = useMemo(
    () => gruposProdutos.filter((grupo) => grupo.visivelPdv !== false),
    [gruposProdutos]
  );
  const gruposVisiveisPorId = useMemo(
    () => new Map(gruposVisiveis.map((grupo) => [grupo.id, grupo])),
    [gruposVisiveis]
  );
  const getCategoriaProduto = useCallback((produto) => {
    if (produto.grupoId) return produto.grupoId;
    const categoriaAntiga = inferProductCategory(produto);
    const nomeAntigo = normalizeText(CATEGORY_LABELS[categoriaAntiga] || categoriaAntiga);
    return gruposVisiveis.find((grupo) => normalizeText(grupo.nome) === nomeAntigo)?.id || categoriaAntiga;
  }, [gruposVisiveis]);
  const produtosDisponiveisPdv = useMemo(
    () => produtosAtivos.filter((produto) => !produto.grupoId || gruposVisiveisPorId.has(produto.grupoId)),
    [gruposVisiveisPorId, produtosAtivos]
  );
  const categoriasDisponiveis = useMemo(() => {
    if (gruposVisiveis.length) return ["todos", ...gruposVisiveis.map((grupo) => grupo.id)];
    const categorias = new Set(produtosAtivos.map((produto) => inferProductCategory(produto)).filter(Boolean));
    return ["todos", ...Object.keys(CATEGORY_LABELS).filter((key) => key !== "todos" && categorias.has(key))];
  }, [gruposVisiveis, produtosAtivos]);
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
          const unidadeVenda = getProdutoUnidadeVenda(produto);
          const precoPadrao = getProdutoPreco(produto);
          const precoUnitario =
            unidadeVenda === "kg"
              ? getProdutoPrecoKg(produto)
              : Number(item.precoUnitario ?? precoPadrao);
          const subtotal =
            unidadeVenda === "kg"
              ? parseDecimalInput(item.valor || 0)
              : precoUnitario * parseDecimalInput(item.quantidade || 0);
          const quantidade =
            unidadeVenda === "kg" && precoUnitario > 0
              ? subtotal / precoUnitario
              : parseDecimalInput(item.quantidade || 0);

          return {
            ...item,
            produto,
            nome: produto.nome,
            unidadeVenda,
            precoUnitario,
            quantidade,
            subtotal,
            subtotalValido:
              Number.isFinite(subtotal) &&
              subtotal > 0 &&
              Number.isFinite(quantidade) &&
              quantidade > 0,
          };
        })
        .filter(Boolean),
    [itensVenda, produtos]
  );
  const produtosFiltrados = useMemo(() => {
    const termo = normalizeText(buscaProduto);

    return produtosDisponiveisPdv.filter((produto) => {
      const categoria = getCategoriaProduto(produto);
      const matchCategoria = categoriaAtiva === "todos" || categoria === categoriaAtiva;
      if (!matchCategoria) return false;
      if (!termo) return true;

      const estoque = String(produto?.estoque ?? "");
      const nome = normalizeText(produto?.nome);
      return nome.includes(termo) || estoque.includes(termo);
    });
  }, [buscaProduto, categoriaAtiva, getCategoriaProduto, produtosDisponiveisPdv]);
  const atendenteLogado = useMemo(
    () => atendentes.find((item) => item.id === caixaAtual?.atendenteId) || null,
    [atendentes, caixaAtual]
  );
  const vendasRankingMesVinculadas = useMemo(() => {
    const caixaIds = new Set(caixasRankingMes.map((item) => item.id));
    return vendasRankingMes.filter((item) => item.caixaId && caixaIds.has(item.caixaId));
  }, [caixasRankingMes, vendasRankingMes]);
  const totalVendas = useMemo(
    () => vendasCaixa.reduce((acc, venda) => acc + Number(venda.valor || 0), 0),
    [vendasCaixa]
  );
  const totalVendasRankingMes = useMemo(
    () => vendasRankingMesVinculadas.reduce((acc, venda) => acc + Number(venda.valor || 0), 0),
    [vendasRankingMesVinculadas]
  );
  const totalItens = useMemo(
    () => vendasCaixa.reduce((acc, venda) => acc + Number(venda.quantidade || 0), 0),
    [vendasCaixa]
  );
  const ranking = useMemo(
    () => buildRanking(vendasRankingMesVinculadas, atendentesAtivos, rankingMesSelecionado),
    [vendasRankingMesVinculadas, atendentesAtivos, rankingMesSelecionado]
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
  const carrinhoTemPendencias = useMemo(
    () =>
      itensVendaDetalhados.some((item) => {
        if (!item.subtotalValido) return true;
        const quantidade = parseDecimalInput(item.quantidade || 0);
        return !Number.isFinite(quantidade) || quantidade <= 0;
      }),
    [itensVendaDetalhados]
  );
  const valorRecebidoAtual = parseDecimalInput(vendaForm.valorRecebido || 0);
  const trocoAtual = useMemo(() => {
    if (vendaForm.formaPagamento !== "Dinheiro") return 0;
    return Math.max(valorRecebidoAtual - totalCarrinho, 0);
  }, [valorRecebidoAtual, totalCarrinho, vendaForm.formaPagamento]);
  const vendaAtualResumo = useMemo(
    () => vendasCaixa.slice(0, 8),
    [vendasCaixa]
  );
  const caixasAbertosGerencia = useMemo(
    () => caixasGerenciaDia.filter((item) => item.status === "aberto"),
    [caixasGerenciaDia]
  );
  const caixaAbertoSelecionado = useMemo(
    () =>
      caixasDoDia.find(
        (item) => item.status === "aberto" && item.atendenteId === loginForm.atendenteId
      ) || null,
    [caixasDoDia, loginForm.atendenteId]
  );
  const modoEntradaCaixa = Boolean(caixaAbertoSelecionado);

  useEffect(() => {
    if (!categoriasDisponiveis.includes(categoriaAtiva)) {
      setCategoriaAtiva("todos");
    }
  }, [categoriaAtiva, categoriasDisponiveis]);

  function toggleRetiradaPanel() {
    setMostrandoRetirada((prev) => !prev);
    setFeedbackRetirada("");
  }

  function selecionarProduto(produto) {
    if (!produto?.id) return;

    const vendaPorPeso = isProdutoPorPeso(produto);
    const quantidadeNoCarrinho = itensVenda
      .filter((item) => item.produtoId === produto.id)
      .reduce((acc, item) => acc + parseDecimalInput(item.quantidade || 0), 0);
    const estoqueDisponivel = Number(produto.estoque || 0) - quantidadeNoCarrinho;

    if (estoqueDisponivel <= 0) {
      setFeedbackVenda("Estoque insuficiente para adicionar esse item.");
      return;
    }

    setItensVenda((prev) => {
      const index = prev.findIndex((item) => item.produtoId === produto.id);
      if (index === -1) {
        return [
          ...prev,
          vendaPorPeso
            ? { produtoId: produto.id, quantidade: "", valor: "" }
            : { produtoId: produto.id, quantidade: 1 },
        ];
      }

      if (vendaPorPeso) {
        return prev;
      }

      return prev.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, quantidade: parseDecimalInput(item.quantidade || 0) + 1 }
          : item
      );
    });

    setVendaForm((prev) => ({ ...prev, produtoId: produto.id }));
    setFeedbackVenda("");
    setToastVenda(
      vendaPorPeso ? `${produto.nome} pronto para informar valor` : `${produto.nome} adicionado`
    );
  }

  function resetVendaForm() {
    setVendaForm({
      produtoId: "",
      quantidade: 1,
      formaPagamento: "PIX",
      valorRecebido: "",
      data: isManagementRole(accessRole) ? vendaForm.data || dataHoje : dataHoje,
    });
    setItensVenda([]);
  }

  function limparCarrinho() {
    if (itensVenda.length && !window.confirm("Deseja realmente excluir todos os itens do carrinho?")) return;
    setItensVenda([]);
    setFeedbackVenda("");
    setVendaForm((prev) => ({ ...prev, valorRecebido: "" }));
  }

  function removerItemVenda(produtoId) {
    const produto = produtos.find((item) => item.id === produtoId);
    if (!window.confirm(`Deseja realmente excluir ${produto?.nome || "este produto"} do carrinho?`)) return;
    setItensVenda((prev) => prev.filter((item) => item.produtoId !== produtoId));
  }

  function atualizarItemVenda(produtoId, campo, valor) {
    setItensVenda((prev) =>
      prev.map((item) => (item.produtoId === produtoId ? { ...item, [campo]: valor } : item))
    );
  }

  async function iniciarCaixa(e) {
    e.preventDefault();
    const atendente = atendentesAtivos.find((item) => item.id === loginForm.atendenteId);
    if (!atendente) return;

    const senhaCadastrada = String(atendente.senha || "");
    const senhaInformada = String(loginForm.senha || "");

    if (!senhaCadastrada) {
      setFeedbackCaixa(`Cadastre uma senha para ${atendente.nome} antes de acessar o caixa.`);
      return;
    }

    if (senhaCadastrada !== senhaInformada) {
      setFeedbackCaixa(`Senha invalida para ${modoEntradaCaixa ? "entrar" : "abrir"} o caixa.`);
      return;
    }

    setAbrindoSessao(true);
    setFeedbackCaixa("");

    try {
      const dataAtual = hojeISO();

      if (caixaAbertoSelecionado) {
        const sessao = bindStoredSession(caixaAbertoSelecionado, accessUser?.id, accessRole);
        writeStoredSession(sessao);
        setCaixaAtualId(caixaAbertoSelecionado.id);
        setCaixaAtual(sessao);
        setLoginForm({ atendenteId: "", senha: "", fundoCaixa: "" });
        setFeedbackCaixa(`Caixa retomado para ${atendente.nome}.`);
        return;
      }

      const fundoCaixa = Number(loginForm.fundoCaixa || 0);
      if (!Number.isFinite(fundoCaixa) || fundoCaixa < 0) {
        setFeedbackCaixa("Informe um fundo de caixa valido.");
        return;
      }

      const docRef = await abrirCaixa(uid, {
        atendenteId: atendente.id,
        atendenteNome: atendente.nome,
        data: dataAtual,
        fundoCaixa,
      });

      const sessao = bindStoredSession({
        id: docRef.id,
        atendenteId: atendente.id,
        atendenteNome: atendente.nome,
        data: dataAtual,
        fundoCaixa,
        status: "aberto",
      }, accessUser?.id, accessRole);

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

  async function encerrarCaixaComoGerencia(caixa) {
    if (!caixa?.id || fechandoSessao) return;

    const confirmar = window.confirm(`Fechar o caixa de ${caixa.atendenteNome}?`);
    if (!confirmar) return;

    setFechandoSessao(true);
    setFeedbackCaixa("");

    try {
      const [vendasDoCaixa, retiradasDoDia] = await Promise.all([
        getVendasPorCaixa(uid, caixa.id),
        getRetiradas(uid, dataHoje, dataHoje),
      ]);

      const retiradasDoCaixa = retiradasDoDia.filter((item) => item.caixaId === caixa.id);
      const totalVendasGerencia = vendasDoCaixa.reduce(
        (acc, item) => acc + Number(item.valor || 0),
        0
      );
      const totalItensGerencia = vendasDoCaixa.reduce(
        (acc, item) => acc + Number(item.quantidade || 0),
        0
      );
      const totalDinheiroGerencia = vendasDoCaixa
        .filter((item) => item.formaPagamento === "Dinheiro")
        .reduce((acc, item) => acc + Number(item.valor || 0), 0);
      const totalRetiradasGerencia = retiradasDoCaixa.reduce(
        (acc, item) => acc + Number(item.valor || 0),
        0
      );
      const valorEmCaixaGerencia =
        Number(caixa.fundoCaixa || 0) + totalVendasGerencia - totalRetiradasGerencia;

      await fecharCaixa(caixa.id, {
        totalVendas: totalVendasGerencia,
        totalItens: totalItensGerencia,
        totalDinheiro: totalDinheiroGerencia,
        totalRetiradas: totalRetiradasGerencia,
        valorEmCaixa: valorEmCaixaGerencia,
      });

      if (caixaAtualId === caixa.id) {
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
      }

      setFeedbackCaixa(`Caixa de ${caixa.atendenteNome} fechado com sucesso.`);
    } catch {
      setFeedbackCaixa("Nao foi possivel fechar o caixa pela gerencia.");
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
      const logoPdf = await getPdfLogo(loja?.logomarca);
      if (logoPdf) doc.addImage(logoPdf.dataUrl, logoPdf.format, 14, 10, 24, 24);
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
      const valorRecebido =
        formaPagamento === "Dinheiro" ? parseDecimalInput(vendaForm.valorRecebido || 0) : 0;
      const troco = formaPagamento === "Dinheiro" ? Math.max(valorRecebido - totalCarrinho, 0) : 0;
      const dataVenda = isManagementRole(accessRole) ? String(vendaForm.data || "").trim() : hojeISO();

      if (!dataVenda) {
        setFeedbackVenda("Selecione uma data valida para a venda.");
        setSalvandoVenda(false);
        return;
      }

      if (formaPagamento === "Dinheiro") {
        if (!Number.isFinite(valorRecebido) || valorRecebido < totalCarrinho) {
          setFeedbackVenda("Informe o valor recebido em dinheiro para calcular o troco.");
          setSalvandoVenda(false);
          return;
        }
      }

      for (const item of itensVendaDetalhados) {
        if (!item.subtotalValido) {
          throw new Error(
            item.unidadeVenda === "kg"
              ? `Informe o valor para ${item.nome}.`
              : `Valor invalido para ${item.nome}.`
          );
        }

        const estoqueAtual = Number(item.produto.estoque || 0);
        if (estoqueAtual < parseDecimalInput(item.quantidade || 0)) {
          throw new Error(`Estoque insuficiente para ${item.nome}.`);
        }
      }

      for (const item of itensVendaDetalhados) {
        await addVenda(uid, {
          produto: item.nome,
          produtoId: item.produto.id,
          valor: item.subtotal,
          quantidade: item.quantidade,
          unidadeVenda: item.unidadeVenda,
          valorUnitario: item.precoUnitario,
          atendente: atendenteLogado.nome,
          atendenteId: atendenteLogado.id,
          atendenteNome: atendenteLogado.nome,
          caixaId: caixaAtual.id,
          formaPagamento,
          valorRecebido: formaPagamento === "Dinheiro" ? valorRecebido : 0,
          troco: formaPagamento === "Dinheiro" ? troco : 0,
          data: dataVenda,
        });
        await updateProduto(item.produto.id, {
          estoque: Number(item.produto.estoque || 0) - parseDecimalInput(item.quantidade || 0),
        });
      }
      imprimirComprovanteTermico({
        loja,
        venda: {
          itens: itensVendaDetalhados,
          total: totalCarrinho,
          formaPagamento,
          valorRecebido,
          troco,
          atendenteNome: atendenteLogado.nome,
          caixaId: caixaAtual.id,
          dataHora: new Date().toLocaleString("pt-BR"),
        },
      });
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

    const valor = parseDecimalInput(retiradaForm.valor || 0);
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
      const dataAtual = hojeISO();
      await addRetiradaCaixa(uid, {
        caixaId: caixaAtual.id,
        atendenteId: atendenteLogado.id,
        atendenteNome: atendenteLogado.nome,
        valor,
        motivo: motivo || "Sangria de caixa",
        data: dataAtual,
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
    <div className={`dashboard-screen ${compactMode ? "pdv-compact" : ""}`}>
      {!compactMode ? (
        <div
          className={`pdv-hero section-card ${loja?.imagemCapaPdv ? "pdv-hero-has-cover" : ""}`}
          style={loja?.imagemCapaPdv ? { "--pdv-cover": `url(${loja.imagemCapaPdv})` } : undefined}
        >
          <div className="pdv-hero-side">
            <span className="screen-badge">{formatDateLabel(dataHoje)}</span>
            {caixaAtual ? <span className="pdv-status-pill">Turno aberto</span> : null}
          </div>
        </div>
      ) : null}

      {caixaAtual ? (
        <div className="section-card pdv-status-bar">
          <div className="pdv-status-bar-copy">
            <span className="stat-label">Atendente no caixa</span>
            <strong>{caixaAtual.atendenteNome}</strong>
            {!compactMode ? <small>Acoes administrativas do turno.</small> : null}
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

      {isManagementRole(accessRole) && caixasAbertosGerencia.length ? (
        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Fechamento pela gerencia</div>
            <span className="section-subtitle">
              {accessUser?.nome ? `Gerencia: ${accessUser.nome}` : "Feche caixas abertos do dia"}
            </span>
          </div>
          <div className="scroll-list">
            {caixasAbertosGerencia.map((caixa) => (
              <div className="list-row" key={`gerencia-close-${caixa.id}`}>
                <div>
                  <strong>{caixa.atendenteNome}</strong>
                  <small>
                    Fundo {formatMoney(caixa.fundoCaixa || 0)} - {formatDateLabel(caixa.data)}
                  </small>
                </div>
                <div className="list-row-actions">
                  <strong className="positive">Aberto</strong>
                  <button
                    className="action-btn action-btn-warning"
                    type="button"
                    onClick={() => encerrarCaixaComoGerencia(caixa)}
                    disabled={fechandoSessao}
                  >
                    {fechandoSessao ? "Fechando..." : "Fechar caixa"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={`pdv-shell ${caixaAtual ? "is-open" : ""}`}>
        {!caixaAtual ? (
          <div className="section-card pdv-card pdv-card-primary">
            <div className="section-header">
              <div className="section-title">{modoEntradaCaixa ? "Entrar no caixa" : "Abrir caixa"}</div>
              <span className="section-subtitle">
                {modoEntradaCaixa
                  ? "Esse atendente ja possui um caixa aberto hoje."
                  : "Entre com o atendente para iniciar o turno."}
              </span>
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
                placeholder="Senha do usuario"
                required
              />

              {!modoEntradaCaixa ? (
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
              ) : null}

              <button
                className="action-btn action-btn-primary pdv-submit"
                type="submit"
                disabled={abrindoSessao}
              >
                {abrindoSessao
                  ? modoEntradaCaixa
                    ? "Entrando..."
                    : "Abrindo..."
                  : modoEntradaCaixa
                    ? "Entrar no caixa"
                    : "Abrir caixa"}
              </button>

              {feedbackCaixa && <p className="inline-feedback">{feedbackCaixa}</p>}
            </form>
          </div>
        ) : (
          <>
            <div className="pdv-main-column">
              <div className="stats-grid pdv-stats-grid">
                {!compactMode && mostrandoResumoExpandido ? (
                  <>
                    <div className="section-card stat-card">
                      <span className="stat-label">Fundo inicial</span>
                      <small className="stat-note">entrada inicial do caixa</small>
                      <strong className="stat-value positive">{formatMoney(fundoCaixaAtual)}</strong>
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
                ) : !compactMode ? (
                  <button
                    className="section-card stat-card stat-card-toggle"
                    type="button"
                    onClick={() => setMostrandoResumoExpandido(true)}
                    aria-expanded="false"
                  >
                    <span className="stat-label">Indicadores</span>
                    <strong className="stat-value">Expandir</strong>
                  </button>
                ) : null}
                {!compactMode ? <div className="section-card stat-card">
                  <span className="stat-label">Itens no turno</span>
                  <strong className="stat-value">{totalItens}</strong>
                </div> : null}
                {!compactMode ? <div className="section-card stat-card">
                  <span className="stat-label">Ticket medio turno</span>
                  <strong className="stat-value positive">
                    {formatMoney(totalItens ? totalVendas / totalItens : 0)}
                  </strong>
                </div> : null}
                <div className="section-card stat-card stat-card-highlight">
                  <span className="stat-label">Total de vendas</span>
                  {!compactMode ? <small className="stat-note">valor vendido neste turno</small> : null}
                  <strong className="stat-value positive">
                    {formatMoney(totalVendas)}
                  </strong>
                </div>
                {!compactMode && mostrandoResumoExpandido ? (
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

              <section className="section-card pdv-card pdv-catalog-panel">
                <div className="pdv-catalog-topbar">
                  <div className="section-header">
                    <div className="section-title">Produtos</div>
                    {!compactMode ? <span className="section-subtitle">
                      Toque no item para selecionar e montar a venda.
                    </span> : null}
                  </div>
                  <input
                    className="input pdv-search-input"
                    value={buscaProduto}
                    onChange={(e) => setBuscaProduto(e.target.value)}
                    placeholder="Buscar por nome do produto"
                  />
                </div>

                <div className="pdv-category-tabs" role="tablist" aria-label="Categorias de produto">
                  {categoriasDisponiveis.map((categoria) => (
                    <button
                      key={categoria}
                      className={`pdv-category-tab ${categoriaAtiva === categoria ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setCategoriaAtiva(categoria)}
                    >
                      {categoria === "todos"
                        ? "Todos"
                        : gruposVisiveisPorId.get(categoria)?.nome || CATEGORY_LABELS[categoria] || categoria}
                    </button>
                  ))}
                </div>

                <div className="pdv-product-grid">
                  {produtosFiltrados.map((produto) => {
                    const preco = getProdutoPreco(produto);
                    const imagem = getProdutoImagem(produto);
                    const vendaPorPeso = isProdutoPorPeso(produto);
                    const isSelected = produto.id === vendaForm.produtoId;
                    const semEstoque = Number(produto.estoque || 0) <= 0;

                    return (
                      <button
                        key={produto.id}
                        className={`pdv-product-card ${isSelected ? "is-selected" : ""}`}
                        type="button"
                        onClick={() => selecionarProduto(produto)}
                        disabled={semEstoque}
                      >
                        <div className="pdv-product-media">
                          {imagem ? (
                            <img src={imagem} alt={produto.nome} className="pdv-product-image" />
                          ) : (
                            <span className="pdv-product-fallback">
                              {String(produto.nome || "?").slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="pdv-product-copy">
                          <strong>{produto.nome}</strong>
                          <small className="positive">
                            {vendaPorPeso
                              ? `Valor/KG ${formatMoney(getProdutoPrecoKg(produto))}`
                              : formatMoney(preco)}
                          </small>
                          <span className={semEstoque ? "negative" : ""}>
                            Estoque {produto.estoque} {vendaPorPeso ? "kg" : "un"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {!produtosFiltrados.length ? (
                    <p className="empty-state">Nenhum produto encontrado para esse filtro.</p>
                  ) : null}
                </div>
              </section>
            </div>

            <aside className="section-card pdv-card pdv-order-panel">
              <div className="section-header">
                <div className="section-title">Venda atual</div>
                <span className="section-subtitle">{caixaAtual.atendenteNome}</span>
              </div>

              {mostrandoRetirada ? (
                <form className="stack-form pdv-retirada-card" onSubmit={registrarRetirada}>
                  <div className="pdv-retirada-head">
                    <div>
                      <strong>Retirada</strong>
                      <small>Sangria de valores do caixa</small>
                    </div>
                    <button className="mini-btn" type="button" onClick={toggleRetiradaPanel}>
                      X
                    </button>
                  </div>
                  <input
                    className="input pdv-panel-input"
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
                    className="input pdv-panel-input"
                    value={retiradaForm.motivo}
                    onChange={(e) =>
                      setRetiradaForm((prev) => ({ ...prev, motivo: e.target.value }))
                    }
                    placeholder="Motivo da sangria"
                  />
                  <div className="pdv-cash-summary">
                    <div className="pdv-cash-row">
                      <span>Disponivel no caixa</span>
                      <strong className="positive">{formatMoney(totalDisponivelEmCaixa)}</strong>
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

              <form className="pdv-order-form" onSubmit={registrarVenda}>
                {isManagementRole(accessRole) ? (
                  <input
                    className="input pdv-panel-input"
                    type="date"
                    value={vendaForm.data}
                    onChange={(e) =>
                      setVendaForm((prev) => ({ ...prev, data: e.target.value }))
                    }
                  />
                ) : null}
                <div className="pdv-selected-product">
                  <span>Produto</span>
                  <strong>{produtoSelecionado?.nome || "Toque nos produtos para somar unidades ao carrinho"}</strong>
                </div>

                {produtoSelecionado && getProdutoImagem(produtoSelecionado) ? (
                  <div className="produto-preview pdv-product-preview-compact">
                    <img
                      className="produto-preview-image"
                      src={getProdutoImagem(produtoSelecionado)}
                      alt={produtoSelecionado.nome}
                    />
                        <div className="produto-preview-info">
                          <strong>{produtoSelecionado.nome}</strong>
                          <small className="positive">
                            {isProdutoPorPeso(produtoSelecionado)
                              ? `Valor/KG ${formatMoney(getProdutoPrecoKg(produtoSelecionado))}`
                              : formatMoney(getProdutoPreco(produtoSelecionado))}
                          </small>
                        </div>
                      </div>
                    ) : null}

                <div className="pdv-order-actions-row pdv-order-actions-row-single">
                  <button
                    className="action-btn action-btn-danger"
                    type="button"
                    onClick={limparCarrinho}
                    disabled={!itensVendaDetalhados.length}
                  >
                    Limpar
                  </button>
                </div>

                <div className="pdv-payment-grid">
                  <select
                    className="input select pdv-panel-input"
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

                  <input
                    className="input pdv-panel-input"
                    value={caixaAtual.atendenteNome}
                    readOnly
                  />
                </div>

                {vendaForm.formaPagamento === "Dinheiro" ? (
                  <div className="pdv-payment-grid pdv-payment-grid-cash">
                    <input
                      className="input pdv-panel-input"
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
                        <span>Troco</span>
                        <strong className="positive">{formatMoney(trocoAtual)}</strong>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="pdv-cart-table">
                  <div className="pdv-cart-table-head">
                    <span>Produto</span>
                    <span>Qtd</span>
                    <span>Unit</span>
                    <span>Total</span>
                  </div>
                  <div className="pdv-cart-list pdv-cart-table-body">
                    {itensVendaDetalhados.map((item) => (
                      <div
                        className={`pdv-cart-table-row ${
                          item.unidadeVenda === "kg" ? "pdv-cart-table-row-weight" : ""
                        }`}
                        key={item.produtoId}
                      >
                        <div className="pdv-cart-table-product">
                          <strong>{item.nome}</strong>
                          <button
                            className="mini-btn danger"
                            type="button"
                            onClick={() => removerItemVenda(item.produtoId)}
                          >
                            Remover
                          </button>
                        </div>
                        {item.unidadeVenda === "kg" ? (
                          <div className="pdv-cart-metric-field">
                            <span className="pdv-cart-metric-label">Valor</span>
                            <input
                              className="input pdv-panel-input pdv-cart-metric-input"
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={item.valor || ""}
                              onChange={(e) =>
                                atualizarItemVenda(item.produtoId, "valor", e.target.value)
                              }
                              placeholder="0,00"
                            />
                          </div>
                        ) : (
                          <span>{item.quantidade}</span>
                        )}
                        {item.unidadeVenda === "kg" ? (
                          <div className="pdv-cart-metric-field">
                            <span className="pdv-cart-metric-label">Peso (KG)</span>
                            <div className="input pdv-panel-input pdv-cart-metric-input pdv-cart-metric-value">
                              {Number(item.quantidade || 0).toLocaleString("pt-BR", {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 3,
                              })}
                            </div>
                          </div>
                        ) : (
                          <span className="positive">{formatMoney(item.precoUnitario)}</span>
                        )}
                        <strong className="positive">{formatMoney(item.subtotal)}</strong>
                      </div>
                    ))}
                    {!itensVendaDetalhados.length ? (
                      <p className="empty-state">Nenhum item adicionado na venda.</p>
                    ) : null}
                  </div>
                </div>

                <div className="pdv-cart-total pdv-cart-total-emphasis">
                  <span>{itensVendaDetalhados.length} produto(s)</span>
                  <strong className="positive">{formatMoney(totalCarrinho)}</strong>
                </div>

                <div className="pdv-order-submit-row">
                  <button
                    className="action-btn action-btn-danger"
                    type="button"
                    onClick={limparCarrinho}
                    disabled={!itensVendaDetalhados.length}
                  >
                    Cancelar
                  </button>
                  <button
                    className="action-btn action-btn-primary pdv-submit"
                    type="submit"
                    disabled={salvandoVenda || !itensVendaDetalhados.length || carrinhoTemPendencias}
                  >
                    {salvandoVenda ? "Salvando..." : "Receber e Finalizar"}
                  </button>
                </div>

                {carrinhoTemPendencias ? (
                  <p className="inline-feedback">
                    Complete os valores dos itens vendidos por KG antes de finalizar.
                  </p>
                ) : null}
                {feedbackVenda ? <p className="inline-feedback">{feedbackVenda}</p> : null}
                {feedbackCaixa ? <p className="inline-feedback">{feedbackCaixa}</p> : null}
                {!mostrandoRetirada && feedbackRetirada ? (
                  <p className="inline-feedback">{feedbackRetirada}</p>
                ) : null}
              </form>
            </aside>
          </>
        )}
      </div>

      {caixaAtual ? (
        <section className="section-card pdv-sales-board">
          <div className="section-header">
            <div className="section-title">Vendas do turno</div>
            <span className="section-subtitle">{vendasCaixa.length} registros</span>
          </div>
          <div className="scroll-list pdv-sales-list">
            {vendaAtualResumo.map((venda) => (
              <div className="list-row pdv-sale-row" key={venda.id}>
                <div>
                  <strong>{venda.produto}</strong>
                  <small>
                    {formatQuantidadeVenda(venda.quantidade, venda.unidadeVenda)} -{" "}
                    {venda.formaPagamento || "Sem forma"}
                  </small>
                  {venda.formaPagamento === "Dinheiro" ? (
                    <small>
                      Recebido {formatMoney(venda.valorRecebido || 0)} - Troco{" "}
                      {formatMoney(venda.troco || 0)}
                    </small>
                  ) : null}
                </div>
                <strong className="positive">{formatMoney(venda.valor)}</strong>
              </div>
            ))}
            {!vendasCaixa.length ? (
              <p className="empty-state">Nenhuma venda registrada neste turno.</p>
            ) : null}
          </div>
        </section>
      ) : null}

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
              <strong className="stat-value positive">{formatMoney(fundoCaixaAtual)}</strong>
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
              <strong className="positive">{formatMoney(resumoPagamentos.PIX)}</strong>
            </div>
            <div className="fechamento-pagamento">
              <span>Dinheiro</span>
              <strong className="positive">{formatMoney(resumoPagamentos.Dinheiro)}</strong>
            </div>
            <div className="fechamento-pagamento">
              <span>Cartao de debito</span>
              <strong className="positive">{formatMoney(resumoPagamentos.Debito)}</strong>
            </div>
            <div className="fechamento-pagamento">
              <span>Cartao de credito</span>
              <strong className="positive">{formatMoney(resumoPagamentos.Credito)}</strong>
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
                    {formatQuantidadeVenda(venda.quantidade, venda.unidadeVenda)} -{" "}
                    {venda.formaPagamento || "Sem forma"}
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

      {!compactMode && isManagementRole(accessRole) ? (
      <div className="section-card ranking-card ranking-card-footer">
        <div className="section-header">
          <div>
            <div className="section-title">Ranking de metas</div>
            <span className="section-subtitle">{formatMonthLabel(rankingMesSelecionado)}</span>
          </div>
          <span className="section-subtitle">
            {Number(totalVendasRankingMes || 0) > 0
              ? formatMoney(totalVendasRankingMes)
              : "Atualizacao em tempo real"}
          </span>
        </div>
        <div className="section-actions">
          <button
            className="action-btn action-btn-secondary"
            type="button"
            onClick={() => setRankingMesSelecionado(getPreviousMonthKey(rankingMesSelecionado))}
          >
            Mes passado
          </button>
          <input
            className="input"
            type="month"
            value={rankingMesSelecionado}
            onChange={(e) => setRankingMesSelecionado(e.target.value)}
          />
        </div>
        <div className="ranking-list">
          {ranking.map((item, index) => {
            const medalha =
              index === 0
                ? "1 lugar"
                : index === 1
                  ? "2 lugar"
                  : index === 2
                    ? "3 lugar"
                    : `${index + 1} lugar`;
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
                  <span className="ranking-value">
                    {meta > 0 ? `${Math.round(progresso)}%` : "Sem meta"}
                  </span>
                </div>
                <div className="ranking-meta">
                  <small>
                    {formatMoney(item.total)} / {formatMoney(meta)}
                  </small>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progresso}%` }} />
                </div>
              </div>
            );
          })}
          {!ranking.length && <p className="empty-state">Nenhuma venda por atendente registrada no mes selecionado.</p>}
        </div>
      </div>
      ) : null}
    </div>
  );
}
