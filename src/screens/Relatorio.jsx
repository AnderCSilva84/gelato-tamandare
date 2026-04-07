import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import logoGelato from "../assets/gelatoimg.jpeg";
import { deleteCaixa, getCaixas } from "../services/caixas";
import { getProdutos } from "../services/produtos";
import {
  getDespesas,
  getVendas,
  getVendasPorCaixa,
  subscribeResumoDiario,
  subscribeVendasDoDia,
} from "../services/vendas";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getLogoDataUrl() {
  const response = await fetch(logoGelato);
  const blob = await response.blob();
  return fileToDataUrl(blob);
}

export default function Relatorio({ uid, dataHoje }) {
  const [dataInicioFiltro, setDataInicioFiltro] = useState(dataHoje);
  const [dataFimFiltro, setDataFimFiltro] = useState(dataHoje);
  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState([]);
  const [vendasHoje, setVendasHoje] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [caixas, setCaixas] = useState([]);
  const [caixaSelecionado, setCaixaSelecionado] = useState(null);
  const [vendasCaixaSelecionado, setVendasCaixaSelecionado] = useState([]);
  const [resumoHoje, setResumoHoje] = useState(null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      setLoading(true);
      const [vendasData, despesasData] = await Promise.all([
        getVendas(uid, dataInicioFiltro, dataFimFiltro),
        getDespesas(uid, dataInicioFiltro, dataFimFiltro),
      ]);
      const caixasData = await getCaixas(dataInicioFiltro, dataFimFiltro);

      if (!ativo) return;
      setVendas(vendasData);
      setDespesas(despesasData);
      setCaixas(caixasData);
      setCaixaSelecionado((prev) =>
        prev ? caixasData.find((item) => item.id === prev.id) || null : null
      );
      setLoading(false);
    }

    if (uid && dataInicioFiltro && dataFimFiltro) {
      carregar();
    }

    return () => {
      ativo = false;
    };
  }, [uid, dataInicioFiltro, dataFimFiltro]);

  useEffect(() => {
    if (!uid || !dataHoje) return;

    const unsubVendasHoje = subscribeVendasDoDia(uid, dataHoje, setVendasHoje);
    const unsubResumoHoje = subscribeResumoDiario(dataHoje, setResumoHoje);

    return () => {
      unsubVendasHoje();
      unsubResumoHoje();
    };
  }, [uid, dataHoje]);

  useEffect(() => {
    let ativo = true;

    async function carregarCaixaSelecionado() {
      if (!caixaSelecionado?.id) {
        setVendasCaixaSelecionado([]);
        return;
      }

      const vendasData = await getVendasPorCaixa(caixaSelecionado.id);
      if (!ativo) return;
      setVendasCaixaSelecionado(vendasData);
    }

    carregarCaixaSelecionado();

    return () => {
      ativo = false;
    };
  }, [caixaSelecionado]);

  const totalVendas = useMemo(
    () => vendas.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [vendas]
  );
  const totalDespesas = useMemo(
    () => despesas.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [despesas]
  );
  const lucro = totalVendas - totalDespesas;
  const totalVendasHojeCalculado = useMemo(
    () => vendasHoje.reduce((acc, item) => acc + Number(item.valor || 0), 0),
    [vendasHoje]
  );
  const totalItensHojeCalculado = useMemo(
    () => vendasHoje.reduce((acc, item) => acc + Number(item.quantidade || 0), 0),
    [vendasHoje]
  );
  const totalVendasHoje = Number(
    resumoHoje?.totalVendas ?? (vendasHoje.length ? totalVendasHojeCalculado : 0)
  );
  const totalItensHoje = Number(
    resumoHoje?.totalItens ?? (vendasHoje.length ? totalItensHojeCalculado : 0)
  );
  const vendasPorAtendente = useMemo(() => {
    const mapa = {};

    vendas.forEach((venda) => {
      const chave = venda.atendenteNome || venda.atendente || "Sem atendente";
      if (!mapa[chave]) {
        mapa[chave] = 0;
      }
      mapa[chave] += Number(venda.valor || 0);
    });

    return Object.entries(mapa)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [vendas]);

  async function excluirCaixa(item) {
    if (!item?.id || item.status === "aberto") return;

    const confirmar = window.confirm(
      `Excluir o caixa de ${item.atendenteNome} em ${item.data}?`
    );
    if (!confirmar) return;

    await deleteCaixa(item.id);
    setCaixas((prev) => prev.filter((caixa) => caixa.id !== item.id));
    if (caixaSelecionado?.id === item.id) {
      setCaixaSelecionado(null);
      setVendasCaixaSelecionado([]);
    }
  }

  async function exportarRelatorioPDF() {
    const produtos = await getProdutos();
    const totalEstoque = produtos.reduce((acc, produto) => acc + Number(produto.estoque || 0), 0);
    const totalProdutosAtivos = produtos.filter((produto) => produto.ativo !== false).length;
    const valorEstoque = produtos.reduce(
      (acc, produto) => acc + Number(produto.precoFinal ?? produto.preco ?? 0) * Number(produto.estoque || 0),
      0
    );

    const doc = new jsPDF();
    let y = 18;

    try {
      const logoDataUrl = await getLogoDataUrl();
      doc.addImage(logoDataUrl, "JPEG", 14, 10, 24, 24);
      y = 42;
    } catch {
      y = 18;
    }

    doc.setFontSize(16);
    doc.text("Relatorio Gerencial", 14, y);
    y += 8;
    doc.setFontSize(11);
    doc.text(`Periodo analisado: ${dataInicioFiltro} ate ${dataFimFiltro}`, 14, y);
    y += 8;

    doc.setFontSize(12);
    doc.text(`Total vendido: ${formatMoney(totalVendas)}`, 14, y);
    y += 6;
    doc.text(`Total de saidas: ${formatMoney(totalDespesas)}`, 14, y);
    y += 6;
    doc.text(`Lucro: ${formatMoney(lucro)}`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text("Vendas por atendente", 14, y);
    y += 8;

    if (!vendasPorAtendente.length) {
      doc.setFontSize(10);
      doc.text("Nenhuma venda registrada no periodo.", 14, y);
      y += 8;
    } else {
      vendasPorAtendente.forEach((item) => {
        doc.setFontSize(10);
        doc.text(`${item.nome}: ${formatMoney(item.total)}`, 14, y);
        y += 6;
      });
    }

    y += 4;
    doc.setFontSize(12);
    doc.text("Estoque", 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Produtos ativos: ${totalProdutosAtivos}`, 14, y);
    y += 6;
    doc.text(`Unidades em estoque: ${totalEstoque}`, 14, y);
    y += 6;
    doc.text(`Valor estimado em estoque: ${formatMoney(valorEstoque)}`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text("Despesas do periodo", 14, y);
    y += 8;

    if (!despesas.length) {
      doc.setFontSize(10);
      doc.text("Nenhuma despesa registrada no periodo.", 14, y);
      y += 8;
    } else {
      despesas.forEach((item) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
        }

        doc.setFontSize(10);
        doc.text(`${item.descricao} - ${item.data} - ${formatMoney(item.valor)}`, 14, y);
        y += 6;
      });
    }

    doc.save(`relatorio-${dataInicioFiltro}-${dataFimFiltro}.pdf`);
  }

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
          <div className="section-title">Filtro por periodo</div>
        </div>
        <input
          className="input"
          type="date"
          value={dataInicioFiltro}
          onChange={(e) => setDataInicioFiltro(e.target.value)}
        />
        <input
          className="input"
          type="date"
          value={dataFimFiltro}
          onChange={(e) => setDataFimFiltro(e.target.value)}
        />
        <div className="section-actions">
          <button className="action-btn action-btn-warning" type="button" onClick={exportarRelatorioPDF}>
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="section-card">
        <div className="section-header">
          <div className="section-title">Vendas de hoje</div>
          <span className="section-subtitle">{dataHoje}</span>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total vendido hoje</span>
            <strong className="stat-value positive">{formatMoney(totalVendasHoje)}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Itens vendidos hoje</span>
            <strong className="stat-value">{totalItensHoje}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Registros de venda</span>
            <strong className="stat-value">{vendasHoje.length}</strong>
          </div>
        </div>
        <div className="scroll-list">
          {vendasHoje.map((item) => (
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
          {!vendasHoje.length && <p className="empty-state">Nenhuma venda registrada hoje.</p>}
        </div>
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
            <div className="section-title">Vendas do periodo</div>
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
            {!vendas.length && !loading && <p className="empty-state">Nenhuma venda encontrada.</p>}
          </div>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Despesas do periodo</div>
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

      <div className="screen-grid">
        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Caixas dos atendentes</div>
            <span className="section-subtitle">{caixas.length} caixas no periodo</span>
          </div>
          <div className="scroll-list">
            {caixas.map((caixa) => (
              <div
                className={`list-row caixa-row-btn ${caixaSelecionado?.id === caixa.id ? "is-selected" : ""}`}
                key={caixa.id}
              >
                <button
                  className="caixa-row-content"
                  type="button"
                  onClick={() => setCaixaSelecionado(caixa)}
                >
                  <div>
                    <strong>
                      Caixa {caixa.atendenteNome} ({caixa.status === "aberto" ? "Aberto" : "Fechado"})
                    </strong>
                    <small>
                      {caixa.data} • {Number(caixa.totalItens || 0)} itens •{" "}
                      {caixa.status === "fechado"
                        ? `Fechado com ${formatMoney(caixa.totalVendas || 0)}`
                        : formatMoney(caixa.totalVendas || 0)}
                    </small>
                  </div>
                </button>
                {caixa.status !== "aberto" ? (
                  <button
                    className="mini-btn danger"
                    type="button"
                    onClick={() => excluirCaixa(caixa)}
                  >
                    Excluir
                  </button>
                ) : null}
              </div>
            ))}
            {!caixas.length && !loading && <p className="empty-state">Nenhum caixa encontrado no periodo.</p>}
          </div>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">
              {caixaSelecionado
                ? `Extrato do caixa ${caixaSelecionado.atendenteNome}`
                : "Extrato do caixa"}
            </div>
            <span className="section-subtitle">
              {caixaSelecionado
                ? caixaSelecionado.status === "aberto"
                  ? "Aberto"
                  : "Fechado"
                : "Selecione um caixa"}
            </span>
          </div>
          <div className="scroll-list">
            {vendasCaixaSelecionado.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.produto}</strong>
                  <small>
                    {item.quantidade} un. • {item.formaPagamento || "Sem forma"} •{" "}
                    {item.atendenteNome || item.atendente}
                  </small>
                </div>
                <strong className="positive">{formatMoney(item.valor)}</strong>
              </div>
            ))}
            {!vendasCaixaSelecionado.length && (
              <p className="empty-state">
                {caixaSelecionado
                  ? "Nenhuma venda encontrada para este caixa."
                  : "Selecione um caixa para ver o extrato."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
