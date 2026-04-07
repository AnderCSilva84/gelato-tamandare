import { useEffect, useMemo, useState } from "react";
import { subscribeAtendentes } from "../services/atendentes";
import { subscribeProdutos, updateProduto } from "../services/produtos";
import { addVenda, deleteVenda, subscribeVendasDoDia } from "../services/vendas";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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

const calcularRanking = (vendas, atendentes) => {
  const mapa = {};

  atendentes.forEach((atendente) => {
    mapa[atendente.id] = {
      id: atendente.id,
      nome: atendente.nome,
      total: 0,
      meta: Number(atendente.meta || 0),
    };
  });

  vendas.forEach((v) => {
    const atendenteId = v.atendenteId || v.atendente || "sem-atendente";
    if (!mapa[atendenteId]) {
      mapa[atendenteId] = {
        id: atendenteId,
        nome: v.atendenteNome || v.atendente || "Sem atendente",
        total: 0,
        meta: 0,
      };
    }

    mapa[atendenteId].total += Number(v.valor || 0);
  });

  return Object.values(mapa)
    .filter((item) => item.total > 0 || item.meta > 0)
    .sort((a, b) => b.total - a.total);
};

export default function Caixa({ uid, dataHoje }) {
  const [produtos, setProdutos] = useState([]);
  const [atendentes, setAtendentes] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvandoVenda, setSalvandoVenda] = useState(false);
  const [feedbackVenda, setFeedbackVenda] = useState("");
  const [vendaForm, setVendaForm] = useState({
    produtoId: "",
    quantidade: 1,
    atendenteId: "",
  });

  useEffect(() => {
    if (!uid) return;

    const unsubProdutos = subscribeProdutos(uid, (lista) => {
      setProdutos(lista);
      setLoading(false);
    });
    const unsubAtendentes = subscribeAtendentes(uid, setAtendentes);
    const unsubVendas = subscribeVendasDoDia(uid, dataHoje, setVendas);

    return () => {
      unsubProdutos();
      unsubAtendentes();
      unsubVendas();
    };
  }, [uid, dataHoje]);

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
  const atendenteSelecionado = useMemo(
    () => atendentes.find((item) => item.id === vendaForm.atendenteId),
    [atendentes, vendaForm.atendenteId]
  );
  const totalVendas = useMemo(
    () => vendas.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [vendas]
  );
  const totalItens = useMemo(
    () => vendas.reduce((acc, item) => acc + Number(item.quantidade || 0), 0),
    [vendas]
  );
  const ranking = useMemo(
    () => calcularRanking(vendas, atendentesAtivos),
    [vendas, atendentesAtivos]
  );

  async function registrarVenda(e) {
    e.preventDefault();
    if (!produtoSelecionado || !atendenteSelecionado) return;

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
        atendente: atendenteSelecionado.nome,
        atendenteId: atendenteSelecionado.id,
        atendenteNome: atendenteSelecionado.nome,
        data: dataHoje,
      });
      await updateProduto(produtoSelecionado.id, {
        estoque: Number(produtoSelecionado.estoque || 0) - quantidade,
      });
      setVendaForm({ produtoId: "", quantidade: 1, atendenteId: "" });
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
          <p className="screen-description">PDV com operacao rapida e visual de balcao.</p>
        </div>
        <div className="pdv-hero-side">
          <span className="screen-badge">{dataHoje}</span>
        </div>
      </div>

      <div className="stats-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Total vendido hoje</span>
          <strong className="stat-value positive">{formatMoney(totalVendas)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Itens vendidos</span>
          <strong className="stat-value">{totalItens}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Ticket medio</span>
          <strong className="stat-value">
            {formatMoney(vendas.length ? totalVendas / vendas.length : 0)}
          </strong>
        </div>
      </div>

      <div className="section-card pdv-card pdv-card-primary">
        <div className="section-header">
          <div className="section-title pdv-form-title">Registrar venda</div>
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
            onChange={(e) => setVendaForm((prev) => ({ ...prev, produtoId: e.target.value }))}
          >
            <option value="">Selecione um produto</option>
            {produtosAtivos.map((produto) => (
              <option key={produto.id} value={produto.id}>
                {produto.nome} • {formatMoney(produto.preco)} • estoque {produto.estoque}
              </option>
            ))}
          </select>

          <input
            className="input pdv-input"
            type="number"
            min="1"
            value={vendaForm.quantidade}
            onChange={(e) => setVendaForm((prev) => ({ ...prev, quantidade: e.target.value }))}
            placeholder="Quantidade"
          />

          <select
            className="input select pdv-input"
            value={vendaForm.atendenteId}
            onChange={(e) => setVendaForm((prev) => ({ ...prev, atendenteId: e.target.value }))}
          >
            <option value="">Selecione o atendente</option>
            {atendentesAtivos.map((atendente) => (
              <option key={atendente.id} value={atendente.id}>
                {atendente.nome}
              </option>
            ))}
          </select>

          <button className="action-btn action-btn-primary pdv-submit" type="submit" disabled={salvandoVenda}>
            {salvandoVenda ? "Salvando..." : "Registrar venda"}
          </button>

          {feedbackVenda && <p className="inline-feedback">{feedbackVenda}</p>}
        </form>
      </div>

      <div className="section-card">
        <div className="section-header">
          <div className="section-title">Vendas registradas</div>
          <span className="section-subtitle">
            {loading ? "Carregando..." : `${vendas.length} itens`}
          </span>
        </div>
        <div className="scroll-list pdv-list">
          {vendas.map((venda) => (
            <div className="list-row" key={venda.id}>
              <div>
                <strong>{venda.produto}</strong>
                <small>
                  {venda.quantidade} un. • {venda.atendenteNome || venda.atendente}
                </small>
              </div>
              <div className="list-row-actions">
                <strong className="positive">{formatMoney(venda.valor)}</strong>
                <button className="mini-btn danger" type="button" onClick={() => deleteVenda(venda.id)}>
                  Excluir
                </button>
              </div>
            </div>
          ))}
          {!vendas.length && !loading && <p className="empty-state">Nenhuma venda registrada hoje.</p>}
        </div>
      </div>

      <div className="section-card ranking-card ranking-card-footer">
        <div className="section-header">
          <div className="section-title">Ranking do Dia</div>
          <span className="section-subtitle">Atualizacao em tempo real</span>
        </div>
        <div className="ranking-list">
          {ranking.map((item, index) => {
            const medalha = index === 0 ? "1º" : index === 1 ? "2º" : index === 2 ? "3º" : `${index + 1}º`;
            const meta = Number(item.meta || 0);
            const progresso = meta > 0 ? Math.min((item.total / meta) * 100, 100) : 0;

            return (
              <div className={`ranking-item ${index === 0 ? "is-first" : ""}`} key={item.id}>
                <div className="ranking-head">
                  <strong>{medalha} {item.nome}</strong>
                  <span>{formatMoney(item.total)}</span>
                </div>
                <small>
                  {item.nome} - {formatMoney(item.total)} / {formatMoney(meta)} ({Math.round(progresso)}%)
                </small>
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
