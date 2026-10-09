import { useMemo, useState } from 'react';
import { FiClock, FiTrendingUp } from 'react-icons/fi';
import { calcularPicosVendas, DIAS_SEMANA } from '../utils/picosVendas';

const dinheiro = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const faixa = h => `${String(h).padStart(2, '0')}h–${String(h + 1).padStart(2, '0')}h`;

function Barras({ dados, labels, metrica, titulo, formatar }) {
  const maximo = Math.max(...dados.map(d => d[metrica]), 1);
  return <div className="sales-bars-panel">
    <h3>{titulo}</h3>
    <div className="sales-bars" role="list" aria-label={titulo}>
      {dados.map((d, i) => <div className="sales-bar-column" role="listitem" key={labels[i]} title={`${labels[i]}: ${formatar(d[metrica])}`}>
        <span className="sales-bar-value">{dados.length < 10 ? formatar(d[metrica]) : ''}</span>
        <div className="sales-bar-track"><div className="sales-bar-fill" style={{ height: `${d[metrica] / maximo * 100}%` }} /></div>
        <span className="sales-bar-label">{labels[i]}</span>
        <span className="sr-only">{formatar(d[metrica])}</span>
      </div>)}
    </div>
  </div>;
}

export default function PicosVendas({ vendas, loading, erro, dadosAgregados }) {
  const [metrica, setMetrica] = useState('faturamento');
  const [selecionado, setSelecionado] = useState(null);
  const dados = useMemo(() => dadosAgregados || calcularPicosVendas(vendas), [vendas, dadosAgregados]);
  const formatar = v => metrica === 'faturamento' ? dinheiro(v) : `${v} pedido${v === 1 ? '' : 's'}`;
  const maximo = Math.max(...dados.mapa.flat().map(d => d[metrica]), 1);
  const picoDia = dados.dias.reduce((melhor, d, i, array) => d[metrica] > array[melhor][metrica] ? i : melhor, 0);
  const picoHora = dados.horas.reduce((melhor, d, i, array) => d[metrica] > array[melhor][metrica] ? i : melhor, 0);
  const detalhe = selecionado ? dados.mapa[selecionado.dia][selecionado.hora] : null;
  return <section className="section-card sales-peaks" aria-labelledby="sales-peaks-title">
    <div className="sales-peaks-heading">
      <div><h2 id="sales-peaks-title"><FiTrendingUp /> Dias e horários de maior venda</h2><p>{dadosAgregados ? 'Movimento das unidades selecionadas' : 'Movimento da unidade'} no período selecionado · horário de Fortaleza</p></div>
      <div className="sales-metric-switch" role="group" aria-label="Medida do gráfico">
        {(dadosAgregados ? ['faturamento'] : ['faturamento', 'pedidos']).map(m => <button type="button" key={m} aria-pressed={metrica === m} onClick={() => setMetrica(m)}>{m === 'faturamento' ? 'Faturamento' : 'Pedidos'}</button>)}
      </div>
    </div>
    {loading ? <p className="empty-state" role="status">Carregando movimento do período…</p>
      : erro ? <p className="inline-feedback" role="alert">{erro}</p>
        : !dados.total.pedidos && !dados.total.faturamento ? <p className="empty-state">Nenhuma venda válida neste período. Selecione outro intervalo para comparar o movimento.</p>
          : <>
            <div className="sales-peak-summary">
              <div><span>Dia com maior movimento</span><strong>{DIAS_SEMANA[picoDia]}</strong><small>{formatar(dados.dias[picoDia][metrica])}</small></div>
              <div><span><FiClock /> Horário de maior movimento</span><strong>{dados.horas.some(h => h.pedidos || h.faturamento) ? faixa(picoHora) : 'Sem horário registrado'}</strong><small>{dados.horas.some(h => h.pedidos || h.faturamento) ? formatar(dados.horas[picoHora][metrica]) : 'Disponível nas novas vendas'}</small></div>
              <div><span>Total do período</span><strong>{formatar(dados.total[metrica])}</strong><small>Vendas canceladas excluídas</small></div>
            </div>
            <div className="sales-chart-grid">
              <Barras dados={dados.dias} labels={DIAS_SEMANA} metrica={metrica} titulo="Por dia da semana" formatar={formatar} />
              <Barras dados={dados.horas} labels={dados.horas.map((_, h) => `${h}h`)} metrica={metrica} titulo="Por hora do dia" formatar={formatar} />
            </div>
            <div className="sales-heatmap-heading"><h3>Dia × horário</h3><span>Mais claro: menor movimento · Mais escuro: maior movimento</span></div>
            <div className="sales-heatmap-scroll" role="region" aria-label="Mapa de vendas por dia e horário" tabIndex={0}>
              <div className="sales-heatmap">
                <span />{dados.horas.map((_, h) => <span className="sales-heatmap-hour" key={h}>{h}h</span>)}
                {DIAS_SEMANA.map((dia, d) => <div className="sales-heatmap-row" key={dia}><span className="sales-heatmap-day">{dia}</span>{dados.mapa[d].map((cell, h) => <button key={h} type="button" className="sales-heatmap-cell" aria-pressed={selecionado?.dia === d && selecionado?.hora === h} aria-label={`${dia}, ${faixa(h)}: ${formatar(cell[metrica])}`} title={`${dia}, ${faixa(h)}: ${formatar(cell[metrica])}`} style={{ '--intensity': cell[metrica] > 0 ? 0.15 + cell[metrica] / maximo * 0.85 : 0 }} onClick={() => setSelecionado({ dia: d, hora: h })} />)}</div>)}
              </div>
            </div>
            <p className="sales-chart-detail" aria-live="polite">{detalhe ? `${DIAS_SEMANA[selecionado.dia]}, ${faixa(selecionado.hora)}: ${dinheiro(detalhe.faturamento)}${dadosAgregados ? '' : ` · ${detalhe.pedidos} pedido(s).`}` : 'Toque em uma faixa do mapa para ver os valores.'}</p>
            <small className="sales-data-note">{dadosAgregados ? 'Faturamento obtido dos resumos diários, sem consultar cada venda. Os dias representam totais do período.' : 'Pedidos com vários produtos são contados uma vez quando possuem identificador de venda. Registros antigos sem esse identificador são contados separadamente. Os dias representam totais do período, sem média por dia.'}</small>
            {dados.semHorario > 0 && <p className="sales-data-note">{dados.semHorario} registro(s) sem horário confiável: incluídos nos totais por dia, excluídos das faixas de horário.</p>}
          </>}
  </section>;
}
