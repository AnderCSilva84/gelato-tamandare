import { useEffect, useMemo, useState } from "react";
import { getDespesas, getVendas } from "../services/vendas";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function Relatorio({ uid, dataHoje }) {
  const [dataFiltro, setDataFiltro] = useState(dataHoje);
  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState([]);
  const [despesas, setDespesas] = useState([]);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      setLoading(true);
      const [vendasData, despesasData] = await Promise.all([
        getVendas(uid, dataFiltro),
        getDespesas(uid, dataFiltro),
      ]);

      if (!ativo) return;
      setVendas(vendasData);
      setDespesas(despesasData);
      setLoading(false);
    }

    if (uid && dataFiltro) {
      carregar();
    }

    return () => {
      ativo = false;
    };
  }, [uid, dataFiltro]);

  const totalVendas = useMemo(
    () => vendas.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [vendas]
  );
  const totalDespesas = useMemo(
    () => despesas.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [despesas]
  );
  const lucro = totalVendas - totalDespesas;

  return (
    <div className="dashboard-screen">
      <div className="screen-heading">
        <div>
          <h1 className="screen-title">Relatório</h1>
          <p className="screen-description">Resumo de vendas, despesas e lucro por data.</p>
        </div>
      </div>

      <div className="section-card filter-card">
        <div className="section-header">
          <div className="section-title">Filtro por data</div>
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
          <span className="stat-label">Vendas</span>
          <strong className="stat-value positive">{formatMoney(totalVendas)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Despesas</span>
          <strong className="stat-value negative">{formatMoney(totalDespesas)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Lucro</span>
          <strong className={`stat-value ${lucro >= 0 ? "positive" : "negative"}`}>
            {formatMoney(lucro)}
          </strong>
        </div>
      </div>

      <div className="screen-grid">
        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Vendas do dia</div>
          </div>
          <div className="scroll-list">
            {vendas.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.produto}</strong>
                  <small>
                    {item.quantidade} un. • {item.atendente}
                  </small>
                </div>
                <strong className="positive">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {!vendas.length && !loading && <p className="empty-state">Nenhuma venda encontrada.</p>}
          </div>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Despesas do dia</div>
          </div>
          <div className="scroll-list">
            {despesas.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.descricao}</strong>
                  <small>{item.data}</small>
                </div>
                <strong className="negative">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {!despesas.length && !loading && <p className="empty-state">Nenhuma despesa encontrada.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
