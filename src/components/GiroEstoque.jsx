import { useMemo, useState } from 'react';
import BarrasHorizontais from './BarrasHorizontais';
import { giroProdutos } from '../utils/analytics';

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const money = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export default function GiroEstoque({ produtos, loading }) {
  const [mes, setMes] = useState(() => hoje().slice(0, 7));
  const [medida, setMedida] = useState('un');
  const dia = hoje();
  const giro = useMemo(() => giroProdutos(produtos, mes, dia), [produtos, mes, dia]);
  const vendidos = giro.filter(p => p.giroInicializado && (p.unidadeVenda === 'kg' ? medida === 'kg' : medida === 'un'))
    .filter(p => p.quantidadeVendida > 0).sort((a, b) => b.quantidadeVendida - a.quantidadeVendida).slice(0, 8);
  const parados = giro.filter(p => Number(p.estoque) > 0 && p.dias !== null).sort((a, b) => b.dias - a.dias).slice(0, 8);
  const pendentes = giro.filter(p => !p.giroInicializado).length;
  const semData = giro.filter(p => Number(p.estoque) > 0 && p.giroInicializado && p.dias === null).length;
  return <section className="section-card stock-analytics">
    <div className="sales-peaks-heading"><div><h2>Giro dos produtos</h2><p>Vendas e tempo sem venda registrada · sem consultas extras ao histórico</p></div><label>Mês das vendas<input className="input" type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} /></label></div>
    {loading ? <p role="status">Carregando produtos…</p> : <>
      <div className="sales-metric-switch" role="group" aria-label="Unidade do ranking">{['un', 'kg'].map(value => <button type="button" key={value} aria-pressed={medida === value} onClick={() => setMedida(value)}>{value === 'un' ? 'Unidades vendidas' : 'Quilos vendidos'}</button>)}</div>
      <div className="analytics-grid">
        <BarrasHorizontais titulo="Produtos mais vendidos" dados={vendidos.map(p => ({ id: p.id, nome: p.nome, valor: p.quantidadeVendida, detalhe: `Faturamento: ${money(p.faturamento)}` }))} formatar={v => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${medida}`} />
        <BarrasHorizontais titulo="Há mais tempo sem vender" cor="#d97706" dados={parados.map(p => ({ id: p.id, nome: p.nome, valor: p.dias, detalhe: p.ultimaVenda ? `Última venda: ${p.ultimaVenda.split('-').reverse().join('/')} · estoque: ${p.estoque} ${p.unidadeVenda || 'un'}` : `Sem venda registrada desde o cadastro · estoque: ${p.estoque} ${p.unidadeVenda || 'un'}` }))} formatar={v => `${v} dia(s)`} />
      </div>
      <p className="sales-data-note">O tempo parado considera a última venda válida de cada produto com estoque disponível, em todo o histórico. Não representa a idade de um lote nem sua validade. Vendas canceladas são excluídas. Vendas antigas sem vínculo identificável com um produto atual ficam fora dos rankings por produto.</p>
      {!!pendentes && <p className="inline-feedback">{pendentes} produto(s) aguardando preparação ou revisão do histórico. Não entram nos rankings.</p>}
      {!!semData && <p className="sales-data-note">{semData} produto(s) sem venda e sem data de cadastro confiável: tempo parado indisponível.</p>}
    </>}
  </section>;
}
