import { useEffect, useMemo, useState } from "react";
import { getCaixas, getRetiradas } from "../services/caixas";
import {
  addDespesa,
  deleteDespesa,
  getDespesas,
  getVendas,
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

function initialForm(data) {
  return {
    descricao: "",
    valor: "",
    data,
  };
}

export default function FluxoCaixa({ uid, dataHoje }) {
  const [dataFiltro, setDataFiltro] = useState(dataHoje);
  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [retiradas, setRetiradas] = useState([]);
  const [caixas, setCaixas] = useState([]);
  const [form, setForm] = useState(() => initialForm(dataHoje));
  const [editandoId, setEditandoId] = useState("");

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      if (!uid || !dataFiltro) return;

      setLoading(true);
      const [vendasData, despesasData, retiradasData, caixasData] = await Promise.all([
        getVendas(uid, dataFiltro),
        getDespesas(uid, dataFiltro),
        getRetiradas(dataFiltro),
        getCaixas(dataFiltro),
      ]);

      if (!ativo) return;
      setVendas(vendasData);
      setDespesas(despesasData);
      setRetiradas(retiradasData);
      setCaixas(caixasData);
      setLoading(false);
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, [uid, dataFiltro]);

  const resumoFinanceiro = useMemo(
    () =>
      calcularResumoFinanceiro({
        vendas,
        despesas,
        retiradas,
        caixas,
      }),
    [caixas, despesas, retiradas, vendas]
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

  async function salvarDespesa(e) {
    e.preventDefault();
    const dataDespesa = editandoId ? form.data : dataFiltro;
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

    const despesasAtualizadas = await getDespesas(uid, dataFiltro);
    setDespesas(despesasAtualizadas);
    setForm(initialForm(dataFiltro));
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
    const despesasAtualizadas = await getDespesas(uid, dataFiltro);
    setDespesas(despesasAtualizadas);
  }

  return (
    <div className="dashboard-screen">
      <div className="screen-heading">
        <div>
          <h1 className="screen-title">Fluxo de caixa</h1>
          <p className="screen-description">
            Area administrativa para despesas, retiradas, saldos e conferencia diaria.
          </p>
        </div>
      </div>

      <div className="section-card filter-card">
        <div className="section-header">
          <div className="section-title">Data de referencia</div>
        </div>
        <input
          className="input"
          type="date"
          value={dataFiltro}
          onChange={(e) => setDataFiltro(e.target.value)}
        />
      </div>

      <div className="stats-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Entradas</span>
          <strong className="stat-value positive">{formatMoney(resumoFinanceiro.entradas)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Gastos</span>
          <strong className="stat-value negative">{formatMoney(resumoFinanceiro.gastos)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Em caixa</span>
          <strong className="stat-value positive">{formatMoney(resumoFinanceiro.emCaixa)}</strong>
        </div>
      </div>

      <div className="stats-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Resultado</span>
          <strong className={`stat-value ${resumoFinanceiro.resultado >= 0 ? "positive" : "negative"}`}>
            {formatMoney(resumoFinanceiro.resultado)}
          </strong>
        </div>
      </div>

      <div className="screen-grid">
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
              value={editandoId ? form.data : dataFiltro}
              onChange={(e) => setForm((prev) => ({ ...prev, data: e.target.value }))}
            />
            <button className="action-btn action-btn-warning" type="submit">
              {editandoId ? "Atualizar despesa" : "Registrar despesa"}
            </button>
          </form>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Saidas lancadas</div>
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
            {!saidasDoDia.length && !loading && <p className="empty-state">Nenhuma saida cadastrada nessa data.</p>}
          </div>
        </div>
      </div>

      <div className="section-card">
        <div className="section-header">
          <div className="section-title">Vendas da data</div>
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
          {!vendas.length && !loading && <p className="empty-state">Nenhuma venda encontrada nessa data.</p>}
        </div>
      </div>
    </div>
  );
}
