import { useEffect, useMemo, useState } from "react";
import {
  addProduto,
  deleteProduto,
  subscribeProdutos,
  updateProduto,
} from "../services/produtos";

function initialForm() {
  return {
    nome: "",
    imagem: "",
    precoCusto: "",
    precoFinal: "",
    estoque: "",
    notaFiscal: "",
    ativo: true,
  };
}

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

export default function Estoque({ uid }) {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm());
  const [editandoId, setEditandoId] = useState("");

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeProdutos(uid, (lista) => {
      setProdutos(lista);
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);

  const totalUnidades = useMemo(
    () => produtos.reduce((acc, produto) => acc + Number(produto.estoque || 0), 0),
    [produtos]
  );
  const produtosAtivos = useMemo(
    () => produtos.filter((produto) => produto.ativo !== false).length,
    [produtos]
  );
  const produtosBaixos = useMemo(
    () =>
      produtos.filter((produto) => {
        const estoque = Number(produto.estoque || 0);
        return estoque > 0 && estoque <= 5;
      }).length,
    [produtos]
  );

  async function salvarProduto(e) {
    e.preventDefault();
    if (!form.nome.trim()) return;

    const payload = {
      nome: form.nome,
      imagem: form.imagem,
      precoCusto: Number(form.precoCusto || 0),
      precoFinal: Number(form.precoFinal || 0),
      estoque: Number(form.estoque || 0),
      notaFiscal: form.notaFiscal,
      ativo: form.ativo,
    };

    if (editandoId) {
      await updateProduto(editandoId, payload);
    } else {
      await addProduto(uid, payload);
    }

    setForm(initialForm());
    setEditandoId("");
  }

  function editar(produto) {
    setEditandoId(produto.id);
    setForm({
      nome: produto.nome || "",
      imagem: produto.imagem || "",
      precoCusto: String(produto.precoCusto ?? ""),
      precoFinal: String(produto.precoFinal ?? produto.preco ?? ""),
      estoque: String(produto.estoque ?? ""),
      notaFiscal: produto.notaFiscal || "",
      ativo: produto.ativo !== false,
    });
  }

  async function alternarAtivo(produto) {
    await updateProduto(produto.id, { ativo: produto.ativo === false });
  }

  return (
    <div className="dashboard-screen">
      <div className="screen-heading">
        <div>
          <h1 className="screen-title">Estoque</h1>
          <p className="screen-description">Cadastro, edição e controle de produtos.</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Unidades restantes</span>
          <strong className="stat-value positive">{totalUnidades}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Produtos ativos</span>
          <strong className="stat-value">{produtosAtivos}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Estoque baixo</span>
          <strong className={`stat-value ${produtosBaixos > 0 ? "negative" : "positive"}`}>
            {produtosBaixos}
          </strong>
        </div>
      </div>

      <div className="screen-grid">
        <div className="section-card">
          <div className="section-header">
            <div className="section-title">{editandoId ? "Editar produto" : "Novo produto"}</div>
          </div>
          <form className="stack-form" onSubmit={salvarProduto}>
            <input
              className="input"
              value={form.nome}
              onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
              placeholder="Nome do produto"
            />
            <input
              className="input"
              value={form.imagem}
              onChange={(e) => setForm((prev) => ({ ...prev, imagem: e.target.value }))}
              placeholder="Imagem do produto (URL ou caminho /produtos/arquivo.jpg)"
            />
            {form.imagem ? (
              <div className="produto-preview">
                <img className="produto-preview-image" src={form.imagem} alt={form.nome || "Preview do produto"} />
                <div className="produto-preview-info">
                  <strong>{form.nome || "Preview da imagem"}</strong>
                  <small>{form.imagem}</small>
                </div>
              </div>
            ) : null}
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.precoCusto}
              onChange={(e) => setForm((prev) => ({ ...prev, precoCusto: e.target.value }))}
              placeholder="Preço de custo"
            />
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.precoFinal}
              onChange={(e) => setForm((prev) => ({ ...prev, precoFinal: e.target.value }))}
              placeholder="Preço final"
            />
            <input
              className="input"
              type="number"
              min="0"
              value={form.estoque}
              onChange={(e) => setForm((prev) => ({ ...prev, estoque: e.target.value }))}
              placeholder="Estoque"
            />
            <input
              className="input"
              value={form.notaFiscal}
              onChange={(e) => setForm((prev) => ({ ...prev, notaFiscal: e.target.value }))}
              placeholder="Número da nota fiscal"
            />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.checked }))}
              />
              Produto ativo
            </label>
            <button className="action-btn action-btn-primary" type="submit">
              {editandoId ? "Atualizar produto" : "Adicionar produto"}
            </button>
          </form>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Lista de produtos</div>
            <span className="section-subtitle">{loading ? "Carregando..." : `${produtos.length} itens`}</span>
          </div>
          <div className="scroll-list">
            {produtos.map((produto) => {
              const estoque = Number(produto.estoque || 0);
              const estoqueBaixo = estoque > 0 && estoque <= 5;

              return (
                <div className={`list-row ${estoqueBaixo ? "stock-low" : ""}`} key={produto.id}>
                  <div>
                    <strong>{produto.nome}</strong>
                    {getProdutoImagem(produto) ? (
                      <div className="estoque-thumb-row">
                        <img
                          className="estoque-thumb"
                          src={getProdutoImagem(produto)}
                          alt={produto.nome}
                        />
                      </div>
                    ) : null}
                    <small>
                      custo {formatMoney(produto.precoCusto || 0)} • venda {formatMoney(produto.precoFinal ?? produto.preco ?? 0)} • estoque {produto.estoque} •{" "}
                      {produto.ativo === false ? "inativo" : "ativo"}
                    </small>
                    {produto.notaFiscal ? <small>NF: {produto.notaFiscal}</small> : null}
                    {estoqueBaixo && (
                      <small className="stock-alert">
                        Restam apenas {estoque} unidade{estoque === 1 ? "" : "s"}.
                      </small>
                    )}
                  </div>
                  <div className="list-row-actions">
                    <button className="mini-btn" type="button" onClick={() => editar(produto)}>
                      Editar
                    </button>
                    <button className="mini-btn" type="button" onClick={() => alternarAtivo(produto)}>
                      {produto.ativo === false ? "Ativar" : "Desativar"}
                    </button>
                    <button className="mini-btn danger" type="button" onClick={() => deleteProduto(produto.id)}>
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
            {!produtos.length && !loading && <p className="empty-state">Nenhum produto cadastrado.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
