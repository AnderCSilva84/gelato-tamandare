import { useEffect, useMemo, useState } from "react";
import { FiGrid, FiRefreshCw } from "react-icons/fi";
import { getComparacaoPeriodo } from '../services/analytics';
import { picosDosResumos } from '../utils/analytics';
import PicosVendas from '../components/PicosVendas';
import BarrasHorizontais from '../components/BarrasHorizontais';

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
  const [refresh, setRefresh] = useState(0);
  const [unidade, setUnidade] = useState('todas');

  useEffect(() => {
    let active = true;
    const period = monthPeriod(month);
    Promise.all(lojas.filter((loja) => loja.ativa !== false).map(async (loja) => {
      const [resumos, registers] = await getComparacaoPeriodo(loja.id, period.start, period.end, refresh > 0);
      const sum = field => resumos.reduce((n, r) => n + Math.round(Number(r[field] || 0) * 100), 0) / 100;
      const revenue = sum('totalVendas'), costs = sum('totalDespesas');
      const consolidated = sum('totalEntradasConsolidadas'), withdrawals = sum('totalRetiradas');
      return { id: loja.id, nome: loja.nome, revenue, costs, result: revenue - costs, resumos, entries: revenue + consolidated, exits: costs + withdrawals, consolidated, withdrawals, sales: sum('totalRegistros'), registers: registers.length };
    })).then((items) => {
      if (!active) return;
      setRows(items.sort((a, b) => b.revenue - a.revenue));
      setFeedback("");
    }).catch((error) => {
      console.error("Erro ao comparar unidades:", error);
      if (active) { setRows([]); setFeedback("Não foi possível carregar a comparação das unidades. Tente atualizar."); }
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [lojas, month, refresh]);

  const totals = useMemo(() => rows.reduce((acc, row) => ({ revenue: acc.revenue + row.revenue, costs: acc.costs + row.costs, result: acc.result + row.result }), { revenue: 0, costs: 0, result: 0 }), [rows]);
  const picos = useMemo(() => picosDosResumos(rows.filter(r => unidade === 'todas' || r.id === unidade).flatMap(r => r.resumos)), [rows, unidade]);

  return <div className="dashboard-screen">
    <div className="screen-heading section-card"><div><h1 className="screen-title app-hero-title-blue screen-title-with-icon"><FiGrid /> Visao da rede</h1><p className="screen-description">Comparacao financeira e ranking das unidades no periodo.</p></div><input className="input" type="month" value={month} onChange={(event) => { if(event.target.value) { setLoading(true); setRows([]); setMonth(event.target.value); } }} /></div>
    <div className="stats-grid"><div className="section-card stat-card"><span className="stat-label">Faturamento da rede</span><strong className="stat-value positive">{money(totals.revenue)}</strong></div><div className="section-card stat-card"><span className="stat-label">Despesas</span><strong className="stat-value negative">{money(totals.costs)}</strong></div><div className="section-card stat-card"><span className="stat-label">Resultado</span><strong className={`stat-value ${totals.result >= 0 ? "positive" : "negative"}`}>{money(totals.result)}</strong></div></div>
    <div className="section-card"><div className="section-header network-ranking-heading"><div className="section-title">Ranking das unidades</div><span className="section-subtitle">{loading ? "Carregando..." : `${rows.length} unidade(s)`}</span><button className="action-btn network-refresh-btn" type="button" disabled={loading} onClick={() => { setLoading(true); setRefresh(n => n + 1); }}><FiRefreshCw aria-hidden="true" className={loading ? 'is-spinning' : undefined} /><span>{loading ? 'Atualizando...' : 'Atualizar'}</span></button></div><div className="scroll-list">{!loading && rows.map((row, index) => <div className="list-row" key={row.id}><div><strong>{index + 1}º · {row.nome}</strong><small>{row.sales} registros de venda · {row.registers} caixas</small><small>Despesas: {money(row.costs)} · Resultado: {money(row.result)}</small></div><strong className="positive">{money(row.revenue)}</strong></div>)}{!loading && !rows.length ? <p className="empty-state">Nenhuma unidade com dados no periodo.</p> : null}</div>{feedback ? <p className="inline-feedback" role="alert">{feedback}</p> : null}</div>
    <section className="section-card"><h2 className="section-title">Entradas e saídas por unidade</h2>{!loading && <div className="analytics-grid"><BarrasHorizontais titulo="Entradas" formatar={money} dados={rows.map(r => ({ id: r.id, nome: r.nome, valor: r.entries, detalhe: `Vendas: ${money(r.revenue)} · consolidadas: ${money(r.consolidated)}` }))} /><BarrasHorizontais titulo="Saídas" cor="#dc2626" formatar={money} dados={rows.map(r => ({ id: r.id, nome: r.nome, valor: r.exits, detalhe: `Despesas: ${money(r.costs)} · retiradas: ${money(r.withdrawals)}` }))} /></div>}<p className="sales-data-note">Entradas incluem vendas e entradas consolidadas. Saídas incluem despesas e retiradas. O resultado considera vendas menos despesas; retiradas não são despesas adicionais. Dados carregados ao abrir ou atualizar, sem consulta por venda.</p></section>
    <section className="section-card"><label>Picos de venda<select className="input" value={unidade} onChange={e => setUnidade(e.target.value)}><option value="todas">Todas as unidades</option>{rows.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></label></section>
    <PicosVendas dadosAgregados={picos} loading={loading} erro={feedback} />
  </div>;
}
