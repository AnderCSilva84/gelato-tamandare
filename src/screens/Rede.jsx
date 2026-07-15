import { useEffect, useMemo, useState } from "react";
import { FiGrid } from "react-icons/fi";
import { getCaixas } from "../services/caixas";
import { getDespesas, getVendas } from "../services/vendas";

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthPeriod(month) {
  const [year, value] = String(month).split("-").map(Number);
  const lastDay = new Date(year, value, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export default function Rede({ lojas }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    const period = monthPeriod(month);
    Promise.all(lojas.filter((loja) => loja.ativa !== false).map(async (loja) => {
      const [sales, expenses, registers] = await Promise.all([
        getVendas(loja.id, period.start, period.end),
        getDespesas(loja.id, period.start, period.end),
        getCaixas(loja.id, period.start, period.end),
      ]);
      const revenue = sales.reduce((total, item) => total + Number(item.valor || 0), 0);
      const costs = expenses.reduce((total, item) => total + Number(item.valor || 0), 0);
      return { id: loja.id, nome: loja.nome, revenue, costs, result: revenue - costs, sales: sales.length, registers: registers.length };
    })).then((items) => {
      if (!active) return;
      setRows(items.sort((a, b) => b.revenue - a.revenue));
      setFeedback("");
    }).catch((error) => {
      console.error("Erro ao comparar unidades:", error);
      if (active) setFeedback("Nao foi possivel carregar a comparacao das unidades.");
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [lojas, month]);

  const totals = useMemo(() => rows.reduce((acc, row) => ({ revenue: acc.revenue + row.revenue, costs: acc.costs + row.costs, result: acc.result + row.result }), { revenue: 0, costs: 0, result: 0 }), [rows]);

  return <div className="dashboard-screen">
    <div className="screen-heading section-card"><div><h1 className="screen-title app-hero-title-blue screen-title-with-icon"><FiGrid /> Visao da rede</h1><p className="screen-description">Comparacao financeira e ranking das unidades no periodo.</p></div><input className="input" type="month" value={month} onChange={(event) => { setLoading(true); setMonth(event.target.value); }} /></div>
    <div className="stats-grid"><div className="section-card stat-card"><span className="stat-label">Faturamento da rede</span><strong className="stat-value positive">{money(totals.revenue)}</strong></div><div className="section-card stat-card"><span className="stat-label">Despesas</span><strong className="stat-value negative">{money(totals.costs)}</strong></div><div className="section-card stat-card"><span className="stat-label">Resultado</span><strong className={`stat-value ${totals.result >= 0 ? "positive" : "negative"}`}>{money(totals.result)}</strong></div></div>
    <div className="section-card"><div className="section-header"><div className="section-title">Ranking das unidades</div><span className="section-subtitle">{loading ? "Carregando..." : `${rows.length} unidade(s)`}</span></div><div className="scroll-list">{rows.map((row, index) => <div className="list-row" key={row.id}><div><strong>{index + 1}º · {row.nome}</strong><small>{row.sales} registros de venda · {row.registers} caixas</small><small>Despesas: {money(row.costs)} · Resultado: {money(row.result)}</small></div><strong className="positive">{money(row.revenue)}</strong></div>)}{!loading && !rows.length ? <p className="empty-state">Nenhuma unidade com dados no periodo.</p> : null}</div>{feedback ? <p className="inline-feedback">{feedback}</p> : null}</div>
  </div>;
}
