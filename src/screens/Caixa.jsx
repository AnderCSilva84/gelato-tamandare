import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import logoGelato from "../assets/gelatoimg.jpeg";
import { abrirCaixa, fecharCaixa, getCaixa, subscribeCaixa } from "../services/caixas";
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

export default function Caixa({ uid, dataHoje }) {
  const [produtos, setProdutos] = useState([]);
  const [atendentes, setAtendentes] = useState([]);
  const [caixaAtualId, setCaixaAtualId] = useState(() => readStoredSession()?.id || "");
  const [caixaAtual, setCaixaAtual] = useState(() => readStoredSession());
  const [vendasCaixa, setVendasCaixa] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [rankingData, setRankingData] = useState(null);
  const [salvandoVenda, setSalvandoVenda] = useState(false);
  const [abrindoSessao, setAbrindoSessao] = useState(false);
  const [fechandoSessao, setFechandoSessao] = useState(false);
  const [mostrandoFechamento, setMostrandoFechamento] = useState(false);
  const [feedbackVenda, setFeedbackVenda] = useState("");
  const [feedbackCaixa, setFeedbackCaixa] = useState("");
  const [loginForm, setLoginForm] = useState({
    atendenteId: "",
    senha: "",
  });
  const [vendaForm, setVendaForm] = useState({
    produtoId: "",
    quantidade: 1,
    formaPagamento: "PIX",
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

  async function iniciarCaixa(e) {
    e.preventDefault();
    const atendente = atendentesAtivos.find((item) => item.id === loginForm.atendenteId);
    if (!atendente) return;

    const senhaCadastrada = String(atendente.senha || "");
    const senhaInformada = String(loginForm.senha || "");

    if (senhaCadastrada && senhaCadastrada !== senhaInformada) {
      setFeedbackCaixa("Senha invalida para abrir o caixa.");
      return;
    }

    setAbrindoSessao(true);
    setFeedbackCaixa("");

    try {
      const docRef = await abrirCaixa(uid, {
        atendenteId: atendente.id,
        atendenteNome: atendente.nome,
        data: dataHoje,
      });

      const sessao = {
        id: docRef.id,
        atendenteId: atendente.id,
        atendenteNome: atendente.nome,
        data: dataHoje,
        status: "aberto",
      };

      writeStoredSession(sessao);
      setCaixaAtualId(docRef.id);
      setCaixaAtual(sessao);
      setLoginForm({ atendenteId: "", senha: "" });
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
      });
      clearStoredSession();
      setCaixaAtual(null);
      setCaixaAtualId("");
      setVendasCaixa([]);
      setMostrandoFechamento(false);
      setVendaForm({ produtoId: "", quantidade: 1, formaPagamento: "PIX" });
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
    doc.text(`Caixa fechado em: ${horarioFechamento}`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text(`Total vendido: ${formatMoney(totalVendas)}`, 14, y);
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
    });

    doc.save(`fechamento-caixa-${dataHoje}.pdf`);
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
      await addVenda(uid, {
        produto: produtoSelecionado.nome,
        valor,
        quantidade,
        atendente: atendenteLogado.nome,
        atendenteId: atendenteLogado.id,
        atendenteNome: atendenteLogado.nome,
        caixaId: caixaAtual.id,
        formaPagamento: vendaForm.formaPagamento,
        data: dataHoje,
      });
      await updateProduto(produtoSelecionado.id, {
        estoque: Number(produtoSelecionado.estoque || 0) - quantidade,
      });
      setVendaForm({ produtoId: "", quantidade: 1, formaPagamento: "PIX" });
      setFeedbackVenda("Venda registrada com sucesso.");
    } catch {
      setFeedbackVenda("Nao foi possivel registrar a venda.");
    } finally {
      setSalvandoVenda(false);
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
          {caixaAtual ? (
            <button
              className="action-btn action-btn-secondary pdv-close-btn"
              type="button"
              onClick={() => setMostrandoFechamento(true)}
              disabled={fechandoSessao || !vendasCaixa.length}
            >
              {fechandoSessao ? "Fechando..." : "Fechar caixa"}
            </button>
          ) : null}
        </div>
      </div>

      <div className={`pdv-shell ${caixaAtual ? "is-open" : ""}`}>
        <div className="pdv-main-column">
          <div className="stats-grid pdv-stats-grid">
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
                    setVendaForm((prev) => ({ ...prev, formaPagamento: e.target.value }))
                  }
                >
                  <option value="PIX">PIX</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Debito">Debito</option>
                  <option value="Credito">Credito</option>
                </select>

                <input className="input pdv-input" value={caixaAtual.atendenteNome} readOnly />

                <button
                  className="action-btn action-btn-primary pdv-submit"
                  type="submit"
                  disabled={salvandoVenda}
                >
                  {salvandoVenda ? "Salvando..." : "Registrar venda"}
                </button>

                {feedbackVenda && <p className="inline-feedback">{feedbackVenda}</p>}
                {feedbackCaixa && <p className="inline-feedback">{feedbackCaixa}</p>}
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
              <span className="stat-label">Total do turno</span>
              <strong className="stat-value positive">{formatMoney(totalVendas)}</strong>
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

          <div className="scroll-list fechamento-lista">
            {vendasCaixa.map((venda) => (
              <div className="list-row" key={venda.id}>
                <div>
                  <strong>{venda.produto}</strong>
                  <small>
                    {venda.quantidade} un. - {venda.formaPagamento || "Sem forma"}
                  </small>
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
    </div>
  );
}
