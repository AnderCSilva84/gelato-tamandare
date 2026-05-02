import { useEffect, useMemo, useState } from "react";
import { getCaixas, subscribeRetiradasDoDia } from "../services/caixas";
import { subscribeProdutos } from "../services/produtos";
import { subscribeDespesasDoDia, subscribeVendasDoDia } from "../services/vendas";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function Gerencia({ uid, dataHoje, onNavigate }) {
  const [vendasHoje, setVendasHoje] = useState([]);
  const [despesasHoje, setDespesasHoje] = useState([]);
  const [retiradasHoje, setRetiradasHoje] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [caixasHoje, setCaixasHoje] = useState([]);

  useEffect(() => {
    if (!uid || !dataHoje) return;

    const unsubVendas = subscribeVendasDoDia(uid, dataHoje, setVendasHoje);
    const unsubDespesas = subscribeDespesasDoDia(uid, dataHoje, setDespesasHoje);
    const unsubProdutos = subscribeProdutos(uid, setProdutos);
    const unsubRetiradas = subscribeRetiradasDoDia(dataHoje, setRetiradasHoje);

    let ativo = true;
    getCaixas(dataHoje, dataHoje).then((items) => {
      if (ativo) setCaixasHoje(items);
    });

    return () => {
      ativo = false;
      unsubVendas();
      unsubDespesas();
      unsubProdutos();
      unsubRetiradas();
    };
  }, [uid, dataHoje]);

  const totalVendas = useMemo(
    () => vendasHoje.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [vendasHoje]
  );
  const totalDespesas = useMemo(
    () => despesasHoje.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [despesasHoje]
  );
  const totalRetiradas = useMemo(
    () => retiradasHoje.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [retiradasHoje]
  );
  const saldoOperacional = totalVendas - totalDespesas - totalRetiradas;
  const caixasAbertos = useMemo(
    () => caixasHoje.filter((item) => item.status === "aberto"),
    [caixasHoje]
  );
  const estoqueBaixo = useMemo(
    () =>
      produtos.filter((produto) => {
        const estoque = Number(produto.estoque || 0);
        return produto.ativo !== false && estoque > 0 && estoque <= 5;
      }),
    [produtos]
  );
  const semEstoque = useMemo(
    () =>
      produtos.filter((produto) => produto.ativo !== false && Number(produto.estoque || 0) === 0),
    [produtos]
  );

  return (
    <div className="dashboard-screen">
      <div className="gerencia-hero section-card">
        <div>
          <span className="pdv-eyebrow">Resumo Gerencial</span>
          <h1 className="screen-title">Operacao do dia</h1>
          <p className="screen-description">
            Visao rapida de vendas, saidas, retiradas e alertas criticos da sorveteria.
          </p>
        </div>
        <span className="screen-badge">{dataHoje}</span>
      </div>

      <div className="stats-grid gerencia-stats-grid">
        <div className="section-card stat-card">
          <span className="stat-label">Receitas</span>
          <strong className="stat-value positive">{formatMoney(totalVendas)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Despesas</span>
          <strong className="stat-value negative">{formatMoney(totalDespesas)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Retiradas</span>
          <strong className="stat-value negative">{formatMoney(totalRetiradas)}</strong>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Saldo operacional</span>
          <strong className={`stat-value ${saldoOperacional >= 0 ? "positive" : "negative"}`}>
            {formatMoney(saldoOperacional)}
          </strong>
        </div>
      </div>

      <div className="gerencia-actions">
        <button className="action-btn action-btn-primary" type="button" onClick={() => onNavigate("pdv")}>
          Ir para PDV
        </button>
        <button className="action-btn action-btn-warning" type="button" onClick={() => onNavigate("fluxo")}>
          Despesas e fluxo
        </button>
        <button className="action-btn action-btn-info" type="button" onClick={() => onNavigate("estoque")}>
          Ver estoque
        </button>
        <button className="action-btn action-btn-secondary" type="button" onClick={() => onNavigate("relatorio")}>
          Abrir relatorio
        </button>
      </div>

      <div className="screen-grid">
        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Caixas abertos</div>
            <span className="section-subtitle">{caixasAbertos.length} em operacao</span>
          </div>
          <div className="scroll-list">
            {caixasAbertos.map((caixa) => (
              <div className="list-row" key={caixa.id}>
                <div>
                  <strong>{caixa.atendenteNome}</strong>
                  <small>Fundo {formatMoney(caixa.fundoCaixa || 0)} • {caixa.data}</small>
                </div>
                <strong className="positive">Aberto</strong>
              </div>
            ))}
            {!caixasAbertos.length && <p className="empty-state">Nenhum caixa aberto no momento.</p>}
          </div>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Alertas de estoque</div>
            <span className="section-subtitle">
              {estoqueBaixo.length + semEstoque.length} produtos em atencao
            </span>
          </div>
          <div className="scroll-list">
            {semEstoque.map((produto) => (
              <div className="list-row stock-low" key={`zero-${produto.id}`}>
                <div>
                  <strong>{produto.nome}</strong>
                  <small>Sem estoque • venda {formatMoney(produto.precoFinal ?? produto.preco ?? 0)}</small>
                </div>
                <strong className="negative">0</strong>
              </div>
            ))}
            {estoqueBaixo.map((produto) => (
              <div className="list-row stock-low" key={`low-${produto.id}`}>
                <div>
                  <strong>{produto.nome}</strong>
                  <small>Estoque baixo • venda {formatMoney(produto.precoFinal ?? produto.preco ?? 0)}</small>
                </div>
                <strong className="negative">{produto.estoque}</strong>
              </div>
            ))}
            {!estoqueBaixo.length && !semEstoque.length && (
              <p className="empty-state">Nenhum alerta de estoque no momento.</p>
            )}
          </div>
        </div>
      </div>

      <div className="screen-grid">
        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Ultimas vendas do dia</div>
            <span className="section-subtitle">{vendasHoje.length} registros</span>
          </div>
          <div className="scroll-list">
            {vendasHoje.slice(0, 8).map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.produto}</strong>
                  <small>
                    {item.quantidade} un. • {item.formaPagamento || "Sem forma"} • {item.atendenteNome || item.atendente}
                  </small>
                </div>
                <strong className="positive">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {!vendasHoje.length && <p className="empty-state">Nenhuma venda registrada hoje.</p>}
          </div>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Saidas do dia</div>
            <span className="section-subtitle">{despesasHoje.length + retiradasHoje.length} registros</span>
          </div>
          <div className="scroll-list">
            {despesasHoje.map((item) => (
              <div className="list-row" key={`despesa-${item.id}`}>
                <div>
                  <strong>{item.descricao}</strong>
                  <small>Despesa operacional</small>
                </div>
                <strong className="negative">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {retiradasHoje.map((item) => (
              <div className="list-row" key={`retirada-${item.id}`}>
                <div>
                  <strong>{item.motivo || "Sangria de caixa"}</strong>
                  <small>{item.atendenteNome || "Sem atendente"}</small>
                </div>
                <strong className="negative">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {!despesasHoje.length && !retiradasHoje.length && (
              <p className="empty-state">Nenhuma saida registrada hoje.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
