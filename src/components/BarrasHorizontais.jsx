export default function BarrasHorizontais({ dados, titulo, formatar = String, cor = 'var(--blue)' }) {
  const max = Math.max(1, ...dados.map(d => d.valor));
  return <div className="horizontal-chart"><h3>{titulo}</h3>{!dados.length ? <p className="empty-state">Sem dados para este período.</p> : <ul aria-label={titulo}>{dados.map(d => <li key={d.id || d.nome}>
    <div><span>{d.nome}</span><strong>{formatar(d.valor)}</strong></div>
    <div className="horizontal-chart-track"><div style={{ width: `${Math.max(0, d.valor) / max * 100}%`, background: cor }} /></div>
    {d.detalhe && <small>{d.detalhe}</small>}
  </li>)}</ul>}</div>;
}
