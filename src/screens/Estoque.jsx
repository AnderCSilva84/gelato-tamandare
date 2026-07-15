import { useEffect, useMemo, useRef, useState } from "react";
import {
  addProduto,
  copiarProdutoParaLojas,
  deleteProduto,
  subscribeProdutos,
  updateProduto,
} from "../services/produtos";
import {
  addGrupoProduto,
  deleteGrupoProduto,
  subscribeGruposProdutos,
  updateGrupoProduto,
} from "../services/gruposProdutos";
import { getPdfLogo } from "../utils/pdfLogo";
import { FiBox } from "react-icons/fi";

function initialForm() {
  return {
    nome: "",
    imagem: "",
    precoCusto: "",
    precoFinal: "",
    estoque: "",
    notaFiscal: "",
    unidadeVenda: "un",
    grupoId: "",
    ativo: true,
  };
}

const GRUPOS_INICIAIS = ["Bebidas", "Lanches", "Refeições", "Sobremesas", "Outros"];

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function inferGrupoInicial(produto) {
  const explicit = normalizeText(produto?.categoria || produto?.grupo || produto?.tipo);
  const nome = normalizeText(produto?.nome);
  const texto = `${explicit} ${nome}`;
  if (/(beb|agua|suco|refrigerante|coca|cafe|cerveja|vinho|cha|energetico)/.test(texto)) return "Bebidas";
  if (/(lanch|hamburg|burger|pizza|coxinha|empada|pastel|sanduiche|pao|tapioca)/.test(texto)) return "Lanches";
  if (/(refei|prato|almoco|janta|file|salmao|picanha|frango|carne|salada)/.test(texto)) return "Refeições";
  if (/(sobrem|doce|sorv|acai|pudim|bolo|brigadeiro|brownie|mousse|picole|chocolate|bombom)/.test(texto)) return "Sobremesas";
  return "Outros";
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

export default function Estoque({ uid, loja = null, lojas = [] }) {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm());
  const [editandoId, setEditandoId] = useState("");
  const [grupos, setGrupos] = useState([]);
  const [gruposCarregados, setGruposCarregados] = useState(false);
  const [novoGrupo, setNovoGrupo] = useState("");
  const [feedbackGrupo, setFeedbackGrupo] = useState("");
  const [destinosProduto, setDestinosProduto] = useState([]);
  const [feedbackMigracao, setFeedbackMigracao] = useState("");
  const feedbackMigracaoTimer = useRef(null);
  const gruposIniciaisCriados = useRef(false);
  const produtosMigrados = useRef(new Set());

  useEffect(() => {
    gruposIniciaisCriados.current = false;
    produtosMigrados.current = new Set();
  }, [uid]);

  useEffect(() => () => {
    if (feedbackMigracaoTimer.current) window.clearTimeout(feedbackMigracaoTimer.current);
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeProdutos(uid, (lista) => {
      setProdutos(lista);
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const unsub = subscribeGruposProdutos(uid, (lista) => {
      setGrupos(lista);
      setGruposCarregados(true);
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid || !gruposCarregados || grupos.length || gruposIniciaisCriados.current) return;
    gruposIniciaisCriados.current = true;
    Promise.all(GRUPOS_INICIAIS.map((nome) => addGrupoProduto(uid, nome))).catch(() => {
      gruposIniciaisCriados.current = false;
      setFeedbackGrupo("Não foi possível criar os grupos iniciais.");
    });
  }, [grupos.length, gruposCarregados, uid]);

  useEffect(() => {
    if (!grupos.length || !produtos.length) return;
    const gruposPorNome = new Map(grupos.map((grupo) => [normalizeText(grupo.nome), grupo]));
    const gruposIniciaisDisponiveis = GRUPOS_INICIAIS.every((nome) => gruposPorNome.has(normalizeText(nome)));
    if (!gruposIniciaisDisponiveis) return;
    const pendentes = produtos.filter((produto) => !produto.grupoId && !produtosMigrados.current.has(produto.id));
    if (!pendentes.length) return;

    pendentes.forEach((produto) => produtosMigrados.current.add(produto.id));
    Promise.all(pendentes.map((produto) => {
      const grupo = gruposPorNome.get(normalizeText(inferGrupoInicial(produto)))
        || gruposPorNome.get("outros");
      if (!grupo) return Promise.resolve();
      return updateProduto(produto.id, { grupoId: grupo.id, grupoNome: grupo.nome });
    })).catch(() => setFeedbackGrupo("Não foi possível vincular o grupo de alguns produtos antigos."));
  }, [grupos, produtos]);

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

    const grupoSelecionado = grupos.find((grupo) => grupo.id === form.grupoId);
    if (!grupoSelecionado) return;

    const payload = {
      nome: form.nome,
      imagem: form.imagem,
      precoCusto: Number(form.precoCusto || 0),
      precoFinal: Number(form.precoFinal || 0),
      estoque: Number(form.estoque || 0),
      notaFiscal: form.notaFiscal,
      unidadeVenda: form.unidadeVenda,
      grupoId: grupoSelecionado.id,
      grupoNome: grupoSelecionado.nome,
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
    const grupoLegado = grupos.find((grupo) => normalizeText(grupo.nome) === normalizeText(inferGrupoInicial(produto)));
    setEditandoId(produto.id);
    setForm({
      nome: produto.nome || "",
      imagem: produto.imagem || "",
      precoCusto: String(produto.precoCusto ?? ""),
      precoFinal: String(produto.precoFinal ?? produto.preco ?? ""),
      estoque: String(produto.estoque ?? ""),
      notaFiscal: produto.notaFiscal || "",
      unidadeVenda: produto.unidadeVenda === "kg" ? "kg" : "un",
      grupoId: produto.grupoId || grupoLegado?.id || "",
      ativo: produto.ativo !== false,
    });
  }

  async function alternarAtivo(produto) {
    await updateProduto(produto.id, { ativo: produto.ativo === false });
  }

  async function copiarProduto(produto) {
    if (!destinosProduto.length) return setFeedbackMigracao("Selecione ao menos uma unidade de destino.");
    try {
      const total = await copiarProdutoParaLojas(produto, destinosProduto);
      if (total) {
        const nomesDestinos = lojas
          .filter((item) => destinosProduto.includes(item.id))
          .map((item) => item.nome)
          .join(", ");
        setFeedbackMigracao(`produto ${produto.nome} transferido para ${nomesDestinos}`);
        if (feedbackMigracaoTimer.current) window.clearTimeout(feedbackMigracaoTimer.current);
        feedbackMigracaoTimer.current = window.setTimeout(() => {
          setFeedbackMigracao("");
          feedbackMigracaoTimer.current = null;
        }, 3000);
      } else {
        setFeedbackMigracao("O produto ja existe nas unidades selecionadas.");
      }
    } catch (error) {
      console.error("Erro ao copiar produto entre unidades:", error);
      setFeedbackMigracao(error?.code === "permission-denied"
        ? "Seu usuario ainda nao tem permissao na unidade selecionada. Saia e entre novamente para atualizar o acesso."
        : "Nao foi possivel copiar o produto. Tente novamente.");
    }
  }

  async function criarGrupo(e) {
    e.preventDefault();
    const nome = novoGrupo.trim();
    if (!nome) return;
    if (grupos.some((grupo) => grupo.nome.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"))) {
      setFeedbackGrupo("Esse grupo já está cadastrado.");
      return;
    }
    try {
      await addGrupoProduto(uid, nome);
      setNovoGrupo("");
      setFeedbackGrupo("Grupo criado com sucesso.");
    } catch {
      setFeedbackGrupo("Não foi possível criar o grupo.");
    }
  }

  async function alternarGrupoNoPdv(grupo) {
    await updateGrupoProduto(grupo.id, { visivelPdv: grupo.visivelPdv === false });
  }

  async function excluirGrupo(grupo) {
    if (produtos.some((produto) => produto.grupoId === grupo.id)) {
      setFeedbackGrupo("Este grupo possui produtos. Mova os produtos antes de excluí-lo.");
      return;
    }
    if (!window.confirm(`Deseja realmente excluir o grupo ${grupo.nome}?`)) return;
    await deleteGrupoProduto(grupo.id);
    setFeedbackGrupo("Grupo excluído.");
  }

  async function excluirProduto(produto) {
    if (!window.confirm(`Deseja realmente excluir o produto ${produto.nome}?`)) return;
    await deleteProduto(produto.id);
  }

  async function createBasePdf(title, subtitle) {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF();
    try {
      const logo = await getPdfLogo(loja?.logomarca);
      if (logo) doc.addImage(logo.dataUrl, logo.format, 14, 10, 22, 22);
    } catch {
      // noop
    }

    doc.setTextColor(24, 33, 47);
    doc.setFontSize(18);
    doc.text(title, 42, 18);
    doc.setFontSize(11);
    doc.setTextColor(96, 112, 134);
    doc.text(subtitle, 42, 26);
    return { doc, autoTable };
  }

  async function exportarInventarioPDF() {
    const { doc, autoTable } = await createBasePdf(
      "Inventario de Estoque",
      `Produtos cadastrados: ${produtos.length}`
    );

    autoTable(doc, {
      startY: 38,
      head: [["Produto", "Estoque", "Custo", "Venda", "Status"]],
      body: produtos.map((produto) => [
        produto.nome,
        String(Number(produto.estoque || 0)),
        formatMoney(produto.precoCusto || 0),
        formatMoney(produto.precoFinal ?? produto.preco ?? 0),
        produto.ativo === false ? "Inativo" : "Ativo",
      ]),
      theme: "grid",
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      styles: { fontSize: 10, cellPadding: 3 },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          const estoque = Number(data.row.raw[1] || 0);
          if (estoque <= 5) {
            data.cell.styles.textColor = [185, 28, 28];
            data.cell.styles.fontStyle = "bold";
          } else {
            data.cell.styles.textColor = [22, 101, 52];
          }
        }
      },
    });

    doc.save("inventario-estoque.pdf");
  }

  async function exportarMovimentacaoPDF() {
    const { doc, autoTable } = await createBasePdf(
      "Movimentacao de Estoque",
      "Relatorio operacional do estoque atual"
    );

    autoTable(doc, {
      startY: 38,
      head: [["Produto", "Estoque atual", "Situacao", "Custo", "Valor de venda", "NF"]],
      body: produtos.map((produto) => {
        const estoque = Number(produto.estoque || 0);
        const situacao =
          produto.ativo === false
            ? "Inativo"
            : estoque === 0
              ? "Sem estoque"
              : estoque <= 5
                ? "Estoque baixo"
                : "Estoque regular";

        return [
          produto.nome,
          String(estoque),
          situacao,
          formatMoney(produto.precoCusto || 0),
          formatMoney(produto.precoFinal ?? produto.preco ?? 0),
          produto.notaFiscal || "-",
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [245, 158, 11], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 3 },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 2) return;
        const situacao = String(data.cell.raw || "");
        if (situacao === "Sem estoque" || situacao === "Estoque baixo") {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
        }
        if (situacao === "Estoque regular") {
          data.cell.styles.textColor = [22, 101, 52];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    doc.save("movimentacao-estoque.pdf");
  }

  return (
    <div className="dashboard-screen">
      <div className="screen-heading section-card inventory-hero">
        <div>
          <h1 className="screen-title app-hero-title-blue screen-title-with-icon"><FiBox /> Estoque</h1>
          <p className="screen-description">Cadastro, edição e controle de produtos.</p>
        </div>
        <span className="screen-badge">Produtos e saldo</span>
      </div>

      <div className="stats-grid inventory-stats-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Unidades restantes</span>
          <strong className="stat-value positive">
            {Math.round(totalUnidades).toLocaleString("pt-BR")}
          </strong>
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

      <div className="section-actions inventory-actions">
        <button className="action-btn action-btn-info" type="button" onClick={exportarInventarioPDF}>
          PDF Inventario
        </button>
        <button className="action-btn action-btn-warning" type="button" onClick={exportarMovimentacaoPDF}>
          PDF Movimentacao
        </button>
      </div>

      <div className="section-card inventory-groups-card">
        <div className="section-header">
          <div>
            <div className="section-title">Grupos de produtos</div>
            <span className="section-subtitle">Escolha quais grupos ficam visíveis no PDV desta loja.</span>
          </div>
          <span className="screen-badge">{grupos.filter((grupo) => grupo.visivelPdv !== false).length} visíveis</span>
        </div>
        <form className="section-actions" onSubmit={criarGrupo}>
          <input
            className="input"
            value={novoGrupo}
            onChange={(e) => setNovoGrupo(e.target.value)}
            placeholder="Nome do novo grupo, por exemplo Bombons"
          />
          <button className="action-btn action-btn-primary" type="submit">Criar grupo</button>
        </form>
        <div className="scroll-list inventory-groups-list">
          {grupos.map((grupo) => (
            <div className="list-row" key={grupo.id}>
              <div>
                <strong>{grupo.nome}</strong>
                <small>{grupo.visivelPdv === false ? "Oculto no PDV" : "Visível no PDV"}</small>
              </div>
              <div className="list-row-actions">
                <button className="mini-btn" type="button" onClick={() => alternarGrupoNoPdv(grupo)}>
                  {grupo.visivelPdv === false ? "Mostrar no PDV" : "Ocultar no PDV"}
                </button>
                <button className="mini-btn danger" type="button" onClick={() => excluirGrupo(grupo)}>
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
        {feedbackGrupo ? <p className="inline-feedback">{feedbackGrupo}</p> : null}
      </div>

      <div className="screen-grid inventory-grid">
        <div className="section-card inventory-form-card">
          <div className="section-header">
            <div className="section-title">{editandoId ? "Editar produto" : "Novo produto"}</div>
          </div>
          <form className="stack-form" onSubmit={salvarProduto}>
            <input
              className="input"
              value={form.nome}
              onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
              placeholder="Nome do produto"
              required
            />
            <select
              className="input select"
              value={form.grupoId}
              onChange={(e) => setForm((prev) => ({ ...prev, grupoId: e.target.value }))}
              required
            >
              <option value="">Selecione o grupo do produto</option>
              {grupos.map((grupo) => (
                <option key={grupo.id} value={grupo.id}>
                  {grupo.nome}{grupo.visivelPdv === false ? " (oculto no PDV)" : ""}
                </option>
              ))}
            </select>
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
            <select
              className="input select"
              value={form.unidadeVenda}
              onChange={(e) => setForm((prev) => ({ ...prev, unidadeVenda: e.target.value }))}
            >
              <option value="un">Venda por unidade</option>
              <option value="kg">Venda por KG</option>
            </select>
            <input
              className="input"
              type="number"
              min="0"
              step={form.unidadeVenda === "kg" ? "0.001" : "1"}
              value={form.estoque}
              onChange={(e) => setForm((prev) => ({ ...prev, estoque: e.target.value }))}
              placeholder={form.unidadeVenda === "kg" ? "Estoque em KG" : "Estoque"}
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

        <div className="section-card inventory-list-card">
          <div className="section-header">
            <div className="section-title">Lista de produtos</div>
            <span className="section-subtitle">{loading ? "Carregando..." : `${produtos.length} itens`}</span>
          </div>
          <div className="stack-form">
            <label className="field-label">Disponibilizar cadastro também em</label>
            {lojas.filter((item) => item.id !== uid).map((item) => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={destinosProduto.includes(item.id)} onChange={(e) => setDestinosProduto((prev) => e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id))} />{item.nome}</label>)}
            {feedbackMigracao ? <p className="inline-feedback">{feedbackMigracao}</p> : null}
          </div>
          <div className="scroll-list">
            {produtos.map((produto) => {
              const estoque = Number(produto.estoque || 0);
              const estoqueBaixo = estoque > 0 && estoque <= 5;

              return (
                <div className={`list-row ${estoqueBaixo ? "stock-low" : ""}`} key={produto.id}>
                  <div>
                    <strong>{produto.nome}</strong>
                    <small>Grupo: {produto.grupoNome || "Outros (produto antigo)"}</small>
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
                      custo <span className="positive">{formatMoney(produto.precoCusto || 0)}</span> • venda <span className="positive">{formatMoney(produto.precoFinal ?? produto.preco ?? 0)}</span> • estoque {produto.estoque} •{" "}
                      {produto.ativo === false ? "inativo" : "ativo"}
                    </small>
                    <small>Tipo de venda: {produto.unidadeVenda === "kg" ? "por KG" : "por unidade"}</small>
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
                    <button className="mini-btn" type="button" onClick={() => copiarProduto(produto)}>Copiar para unidades</button>
                    <button className="mini-btn danger" type="button" onClick={() => excluirProduto(produto)}>
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
