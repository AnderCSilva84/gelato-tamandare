import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
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
  subscribeRankingDiario,
  subscribeResumoDiario,
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

function buildRanking(rankingData, atendentes) {
  const mapa = rankingData?.atendentes || {};
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

export default function Caixa({
  uid,
  dataHoje,
  accessRole = "atendente",
  onCaixaStatusChange,
  openRetiradaSignal = 0,
}) {
  const [produtos, setProdutos] = useState([]);
  const [atendentes, setAtendentes] = useState([]);
  const [caixaAtualId, setCaixaAtualId] = useState(() => readStoredSession()?.id || "");
  const [caixaAtual, setCaixaAtual] = useState(() => readStoredSession());
  const [vendasCaixa, setVendasCaixa] = useState([]);
  const [retiradasCaixa, setRetiradasCaixa] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [rankingData, setRankingData] = useState(null);
  const [salvandoVenda, setSalvandoVenda] = useState(false);
  const [salvandoRetirada, setSalvandoRetirada] = useState(false);
  const [abrindoSessao, setAbrindoSessao] = useState(false);
  const [fechandoSessao, setFechandoSessao] = useState(false);
  const [mostrandoFechamento, setMostrandoFechamento] = useState(false);
  const [mostrandoRetirada, setMostrandoRetirada] = useState(false);
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
    const unsubResumo = subscribeResumoDiario(dataHoje, setResumo);
    const unsubRanking = subscribeRankingDiario(dataHoje, setRankingData);

    return () => {
      unsubProdutos();
      unsubAtendentes();
      unsubResumo();
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
    const unsub = subscribeRetiradasCaixa(caixaAtualId, setRetiradasCaixa);
    return () => unsub();
  }, [caixaAtualId]);

  useEffect(() => {
    if (typeof onCaixaStatusChange === "function") {
      onCaixaStatusChange(Boolean(caixaAtual));
    }
  }, [caixaAtual, onCaixaStatusChange]);

  useEffect(() => {
    if (!openRetiradaSignal || !caixaAtual) return;
    toggleRetiradaPanel();
  }, [caixaAtual, openRetiradaSignal]);

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
  const atendenteLogado = useMemo(
    () => atendentes.find((item) => item.id === caixaAtual?.atendenteId) || null,
    [atendentes, caixaAtual]
  );
  const totalVendas = useMemo(
    () => vendasCaixa.reduce((acc, venda) => acc + Number(venda.valor || 0), 0),
    [vendasCaixa]
  );
  const totalItens = useMemo(
    () => vendasCaixa.reduce((acc, venda) => acc + Number(venda.quantidade || 0), 0),
    [vendasCaixa]
  );
  const ranking = useMemo(
    () => buildRanking(rankingData, atendentesAtivos),
    [rankingData, atendentesAtivos]
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
  const totalDinheiroEmCaixa =
    Number(resumoPagamentos.Dinheiro || 0) + fundoCaixaAtual - totalRetiradas;
  const valorVendaAtual = useMemo(() => {
    if (!produtoSelecionado) return 0;
    const quantidade = Number(vendaForm.quantidade || 0);
    if (!Number.isFinite(quantidade) || quantidade <= 0) return 0;
    return Number(produtoSelecionado.preco || 0) * quantidade;
  }, [produtoSelecionado, vendaForm.quantidade]);
  const valorRecebidoAtual = Number(vendaForm.valorRecebido || 0);
  const trocoAtual = useMemo(() => {
    if (vendaForm.formaPagamento !== "Dinheiro") return 0;
    return Math.max(valorRecebidoAtual - valorVendaAtual, 0);
  }, [valorRecebidoAtual, valorVendaAtual, vendaForm.formaPagamento]);

  function toggleRetiradaPanel() {
    setMostrandoRetirada((prev) => !prev);
    setFeedbackRetirada("");
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
        valorEmCaixa: totalDinheiroEmCaixa,
      });
      clearStoredSession();
      setCaixaAtual(null);
      setCaixaAtualId("");
      setVendasCaixa([]);
      setRetiradasCaixa([]);
      setMostrandoFechamento(false);
      setMostrandoRetirada(false);
      setVendaForm({ produtoId: "", quantidade: 1, formaPagamento: "PIX", valorRecebido: "" });
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

    const doc = new jsPDF();
    let y = 18;
    const horarioAbertura = formatDateTime(caixaAtual.abertoEm) || "Nao disponivel";
    const horarioFechamento = new Date().toLocaleString("pt-BR");

    try {
      const logoDataUrl = await getLogoDataUrl();
      doc.addImage(logoDataUrl, "JPEG", 14, 10, 24, 24);
      y = 42;
    } catch {
      y = 18;
    }

    doc.setFontSize(16);
    doc.text("Fechamento de Caixa", 14, y);

    y += 8;
    doc.setFontSize(11);
    doc.text(`Data: ${dataHoje}`, 14, y);
    y += 6;
    doc.text(`Atendente: ${caixaAtual.atendenteNome}`, 14, y);
    y += 6;
    doc.text(`Caixa aberto em: ${horarioAbertura}`, 14, y);
    y += 6;
    doc.text(`Fundo de caixa: ${formatMoney(fundoCaixaAtual)}`, 14, y);
    y += 6;
    doc.text(`Retiradas: ${formatMoney(totalRetiradas)}`, 14, y);
    y += 6;
    doc.text(`Caixa fechado em: ${horarioFechamento}`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text(`Total vendido: ${formatMoney(totalVendas)}`, 14, y);
    y += 6;
    doc.text(`Dinheiro em caixa: ${formatMoney(totalDinheiroEmCaixa)}`, 14, y);
    y += 6;
    doc.text(`Itens vendidos: ${totalItens}`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text("Resumo por forma de pagamento", 14, y);
    y += 8;

    [
      ["PIX", resumoPagamentos.PIX],
      ["Dinheiro", resumoPagamentos.Dinheiro],
      ["Debito", resumoPagamentos.Debito],
      ["Credito", resumoPagamentos.Credito],
    ].forEach(([label, valor]) => {
      doc.setFontSize(11);
      doc.text(`${label}: ${formatMoney(valor)}`, 14, y);
      y += 6;
    });

    if (retiradasCaixa.length) {
      y += 4;
      doc.setFontSize(12);
      doc.text("Retiradas do turno", 14, y);
      y += 8;

      retiradasCaixa.forEach((retirada) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
        }

        doc.setFontSize(10);
        doc.text(
          `${retirada.motivo || "Sangria"} | ${formatMoney(retirada.valor)}`,
          14,
          y
        );
        y += 6;
      });
    }

    y += 4;
    doc.setFontSize(12);
    doc.text("Vendas do turno", 14, y);
    y += 8;

    vendasCaixa.forEach((venda) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(10);
      doc.text(
        `${venda.produto} | ${venda.quantidade} un. | ${venda.formaPagamento || "Sem forma"} | ${formatMoney(venda.valor)}`,
        14,
        y
      );
      y += 6;
      if (venda.formaPagamento === "Dinheiro") {
        doc.text(
          `Recebido: ${formatMoney(venda.valorRecebido || 0)} | Troco: ${formatMoney(venda.troco || 0)}`,
          14,
          y
        );
        y += 6;
      }
    });

    const pdfBlobUrl = doc.output("bloburl");
    window.open(pdfBlobUrl, "_blank", "noopener,noreferrer");
  }

  async function registrarVenda(e) {
    e.preventDefault();
    if (!caixaAtual || !produtoSelecionado || !atendenteLogado) return;

    const quantidade = Number(vendaForm.quantidade || 0);
    if (!Number.isFinite(quantidade) || quantidade <= 0) return;
    if (Number(produtoSelecionado.estoque || 0) < quantidade) {
      setFeedbackVenda("Estoque insuficiente para registrar a venda.");
      return;
    }

    setSalvandoVenda(true);
    setFeedbackVenda("");

    try {
      const valor = Number(produtoSelecionado.preco || 0) * quantidade;
      const formaPagamento = vendaForm.formaPagamento;
      const valorRecebido = formaPagamento === "Dinheiro" ? Number(vendaForm.valorRecebido || 0) : 0;
      const troco = formaPagamento === "Dinheiro" ? Math.max(valorRecebido - valor, 0) : 0;

      if (formaPagamento === "Dinheiro") {
        if (!Number.isFinite(valorRecebido) || valorRecebido < valor) {
          setFeedbackVenda("Informe o valor recebido em dinheiro para calcular o troco.");
          setSalvandoVenda(false);
          return;
        }
      }

      await addVenda(uid, {
        produto: produtoSelecionado.nome,
        valor,
        quantidade,
        atendente: atendenteLogado.nome,
        atendenteId: atendenteLogado.id,
        atendenteNome: atendenteLogado.nome,
        caixaId: caixaAtual.id,
        formaPagamento,
        valorRecebido,
        troco,
        data: dataHoje,
      });
      await updateProduto(produtoSelecionado.id, {
        estoque: Number(produtoSelecionado.estoque || 0) - quantidade,
      });
      setVendaForm({ produtoId: "", quantidade: 1, formaPagamento: "PIX", valorRecebido: "" });
      setToastVenda("Venda registrada com sucesso.");
    } catch {
      setFeedbackVenda("Nao foi possivel registrar a venda.");
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

    if (valor > totalDinheiroEmCaixa) {
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
    } catch {
      setFeedbackRetirada("Nao foi possivel registrar a retirada.");
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
        </div>
        <div className="pdv-hero-side">
          <span className="screen-badge">{dataHoje}</span>
          {caixaAtual ? <span className="pdv-status-pill">Turno aberto</span> : null}
        </div>
      </div>

      {caixaAtual ? (
        <div className="section-card pdv-status-bar">
          <div className="pdv-status-bar-copy">
            <span className="stat-label">Caixa em operacao</span>
            <strong>{caixaAtual.atendenteNome}</strong>
            <small>
              Dinheiro disponivel {formatMoney(totalDinheiroEmCaixa)} • Vendas {formatMoney(totalVendas)}
            </small>
          </div>
          <div className="pdv-status-bar-actions">
            <button
              className="action-btn action-btn-warning"
              type="button"
              onClick={toggleRetiradaPanel}
            >
              {mostrandoRetirada ? "Ocultar retirada" : "Retirada"}
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
            <div className="section-card stat-card">
              <span className="stat-label">Fundo inicial</span>
              <strong className="stat-value">{formatMoney(fundoCaixaAtual)}</strong>
            </div>
            <div className="section-card stat-card">
              <span className="stat-label">Retiradas</span>
              <strong className="stat-value negative">{formatMoney(totalRetiradas)}</strong>
            </div>
            <div className="section-card stat-card">
              <span className="stat-label">Total no turno</span>
              <strong className="stat-value positive">{formatMoney(totalVendas)}</strong>
            </div>
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
                      <strong>{formatMoney(totalDinheiroEmCaixa)}</strong>
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
                      <small>{formatMoney(produtoSelecionado.preco)}</small>
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
                      {produto.nome} - {formatMoney(produto.preco)} - estoque {produto.estoque}
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
                      min={valorVendaAtual || 0}
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
                        <strong>{formatMoney(valorVendaAtual)}</strong>
                      </div>
                      <div className="pdv-cash-row">
                        <span>Troco</span>
                        <strong>{formatMoney(trocoAtual)}</strong>
                      </div>
                    </div>
                  </>
                ) : null}

                <input className="input pdv-input" value={caixaAtual.atendenteNome} readOnly />

                <button
                  className="action-btn action-btn-primary pdv-submit"
                  type="submit"
                  disabled={salvandoVenda}
                >
                  {salvandoVenda ? "Salvando..." : "Registrar venda"}
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
              <strong className="stat-value">{formatMoney(fundoCaixaAtual)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Retiradas</span>
              <strong className="stat-value negative">{formatMoney(totalRetiradas)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total do turno</span>
              <strong className="stat-value positive">{formatMoney(totalVendas)}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Dinheiro em caixa</span>
              <strong className="stat-value positive">{formatMoney(totalDinheiroEmCaixa)}</strong>
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
          <div className="section-title">Ranking do Dia</div>
          <span className="section-subtitle">
            {Number(resumo?.totalVendas || 0) > 0
              ? formatMoney(resumo.totalVendas)
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
          {!ranking.length && <p className="empty-state">Nenhuma venda por atendente registrada hoje.</p>}
        </div>
      </div>
      ) : null}
    </div>
  );
}
