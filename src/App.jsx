import { useEffect, useMemo, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import {
  apagarLancamento,
  criarLancamento,
  escutarLancamentosMes,
  escutarTodosLancamentos,
  hojeISO,
  mesISO,
} from "./services/lancamentos";
import TelaAtendentes from "./screens/Atendentes";
import TelaCaixa from "./screens/Caixa";
import TelaEstoque from "./screens/Estoque";
import TelaFluxoCaixa from "./screens/FluxoCaixa";
import TelaRelatorio from "./screens/Relatorio";
import logoGelato from "./assets/gelatoimg.jpeg";
import "./styles/glass.css";
import "./styles.css";
import "./styles/responsive.css";

const TEMP_USER = { uid: "gelato-local" };

const FilterIcon = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 6h16" />
    <path d="M6 12h12" />
    <path d="M10 18h4" />
  </svg>
);

const HistoryIcon = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const ClockIcon = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5h4" />
  </svg>
);

function formatMoney(valor, ocultar) {
  if (ocultar) return "R$ •••••";
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataBR(dataISO) {
  if (!dataISO) return "";
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHeader(dataISO) {
  if (!dataISO) return "";
  const [ano, mes, dia] = dataISO.split("-");
  const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
  const texto = data
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .replace(".", "");
  const [d, m, a] = texto.split(" ");
  const mesFormatado = m ? m[0].toUpperCase() + m.slice(1) : m;
  return `${d} ${mesFormatado} ${a}`;
}

function getMonthFromDate(dateStr) {
  return String(dateStr || "").slice(0, 7);
}

function isRetroativo(mesLancamento) {
  return mesLancamento !== mesISO();
}

export default function App() {
  const [user] = useState(TEMP_USER);
  const [tela, setTela] = useState("pdv");
  const [lancamentos, setLancamentos] = useState([]);
  const [todosLancamentos, setTodosLancamentos] = useState([]);
  const [mesSelecionado, setMesSelecionado] = useState(mesISO());
  const [filtroAtivo, setFiltroAtivo] = useState(false);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [buscaDataAtiva, setBuscaDataAtiva] = useState(false);
  const [dataLancamento, setDataLancamento] = useState(hojeISO());
  const [dataTemp, setDataTemp] = useState(hojeISO());
  const [retroDescricao, setRetroDescricao] = useState("");
  const [retroValor, setRetroValor] = useState("");
  const [retroTipo, setRetroTipo] = useState("SAIDA");

  const navigate = useNavigate();

  useEffect(() => {
    const unsub = escutarLancamentosMes(user.uid, mesSelecionado, setLancamentos);
    return () => unsub && unsub();
  }, [user.uid, mesSelecionado]);

  useEffect(() => {
    const unsub = escutarTodosLancamentos(user.uid, setTodosLancamentos);
    return () => unsub && unsub();
  }, [user.uid]);

  const lancamentosFiltrados = useMemo(() => {
    if (!buscaDataAtiva || !dataInicio || !dataFim) return lancamentos;
    return todosLancamentos.filter((l) => l.data >= dataInicio && l.data <= dataFim);
  }, [buscaDataAtiva, dataFim, dataInicio, lancamentos, todosLancamentos]);

  const lancamentosOrdenados = useMemo(() => {
    return [...lancamentosFiltrados].sort((a, b) => {
      const dataA = String(a?.data || "");
      const dataB = String(b?.data || "");
      const byDate = dataB.localeCompare(dataA);
      if (byDate !== 0) return byDate;
      return String(b?.id || "").localeCompare(String(a?.id || ""));
    });
  }, [lancamentosFiltrados]);

  function voltarExtrato() {
    navigate("/");
  }

  function abrirRetroativo() {
    navigate("/retroativo");
  }

  function toggleFiltro() {
    setFiltroAtivo((prev) => {
      const novo = !prev;
      if (!novo) {
        setBuscaDataAtiva(false);
        setDataInicio("");
        setDataFim("");
        setMesSelecionado(mesISO());
      }
      return novo;
    });
  }

  function toggleBuscaData() {
    if (buscaDataAtiva) {
      setBuscaDataAtiva(false);
      setDataInicio("");
      setDataFim("");
      setMesSelecionado(mesISO());
      setFiltroAtivo(false);
      return;
    }

    if (!dataInicio || !dataFim) {
      alert("Selecione data inicial e data final para buscar o extrato.");
      return;
    }

    setBuscaDataAtiva(true);
  }

  function confirmarData() {
    setDataLancamento(dataTemp);
  }

  async function registrarRetroativo() {
    const v = Number(retroValor);
    if (!Number.isFinite(v) || v <= 0) return;

    const data = dataLancamento || hojeISO();
    const mes = getMonthFromDate(data);
    const descricao = (retroDescricao || "Lançamento Retroativo").trim();
    const tipo = retroTipo === "ENTRADA" ? "ENTRADA" : "SAIDA";

    await criarLancamento({
      uid: user.uid,
      tipo,
      valor: v,
      data,
      mes,
      descricao,
    });

    if (mes !== mesSelecionado) setMesSelecionado(mes);

    setRetroDescricao("");
    setRetroValor("");
    setRetroTipo("SAIDA");
  }

  async function handleApagarLancamento(item) {
    if (!item?.id) return;

    const confirma = window.confirm(
      `Apagar este lançamento?\n\n${formatarDataBR(item.data)} • ${item.descricao}\n${item.tipo} • ${formatMoney(item.valor, false)}`
    );
    if (!confirma) return;

    try {
      await apagarLancamento(user.uid, item.id);
      setLancamentos((prev) => prev.filter((atual) => atual.id !== item.id));
      setTodosLancamentos((prev) => prev.filter((atual) => atual.id !== item.id));
    } catch (err) {
      console.error(err);
      alert("Não foi possível apagar. Verifique sua conexão e tente novamente.");
    }
  }

  function exportarPDF() {
    const doc = new jsPDF();
    const itensPDF = lancamentosOrdenados;
    const totalEntradas = lancamentosFiltrados
      .filter((l) => l.tipo === "ENTRADA")
      .reduce((acc, l) => acc + Number(l.valor), 0);
    const totalSaidas = lancamentosFiltrados
      .filter((l) => l.tipo === "SAIDA")
      .reduce((acc, l) => acc + Number(l.valor), 0);
    const totalFinal = totalEntradas - totalSaidas;

    let y = 20;

    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text("GELATO TAMANDARE", 14, y);

    y += 8;
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    const periodoTexto =
      buscaDataAtiva && dataInicio && dataFim
        ? `Período: ${formatarDataBR(dataInicio)} até ${formatarDataBR(dataFim)}`
        : `Período: Mês ${mesSelecionado}`;
    doc.text(periodoTexto, 14, y);

    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text("Data", 14, y);
    doc.text("Descrição", 42, y);
    doc.text("Entrada", 140, y, { align: "right" });
    doc.text("Saída", 166, y, { align: "right" });
    doc.text("Valor", 195, y, { align: "right" });

    y += 4;
    doc.setDrawColor(210, 210, 210);
    doc.line(14, y, 196, y);
    y += 6;

    itensPDF.forEach((item) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const data = formatarDataBR(item.data);
      const descricao = item.embarcacao ? item.embarcacao : item.descricao || "";
      const valor = Number(item.valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const entradaValor = item.tipo === "ENTRADA" ? valor : "-";
      const saidaValor = item.tipo === "SAIDA" ? valor : "-";
      const valorFinal = `${item.tipo === "ENTRADA" ? "+" : "-"} ${valor}`;

      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      doc.text(data, 14, y);
      doc.text(descricao, 42, y);

      doc.setTextColor(22, 101, 52);
      doc.text(entradaValor, 140, y, { align: "right" });

      doc.setTextColor(185, 28, 28);
      doc.text(saidaValor, 166, y, { align: "right" });

      doc.setTextColor(item.tipo === "ENTRADA" ? 22 : 185, item.tipo === "ENTRADA" ? 101 : 28, item.tipo === "ENTRADA" ? 52 : 28);
      doc.text(valorFinal, 195, y, { align: "right" });
      y += 7;
    });

    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    y += 4;
    doc.setDrawColor(210, 210, 210);
    doc.line(14, y, 196, y);

    y += 8;
    doc.setFontSize(11);
    doc.setTextColor(22, 101, 52);
    doc.text("Total de Entradas:", 14, y);
    doc.text(totalEntradas.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), 180, y, { align: "right" });

    y += 7;
    doc.setTextColor(185, 28, 28);
    doc.text("Total de Saídas:", 14, y);
    doc.text(totalSaidas.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), 180, y, { align: "right" });

    y += 9;
    const corTotal = totalFinal >= 0 ? [22, 101, 52] : [185, 28, 28];
    doc.setTextColor(corTotal[0], corTotal[1], corTotal[2]);
    doc.setFontSize(12);
    doc.text("TOTAL FINAL:", 14, y);
    doc.text(totalFinal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), 180, y, { align: "right" });

    doc.save(`extrato-${mesSelecionado}.pdf`);
  }

  const extratoSection = (
    <div className="section-card">
      <div className="section-header section-header-main">
        <div className="section-title">
          <span className="section-icon info">{HistoryIcon}</span>
          Histórico de Lançamentos
        </div>
        <span className="section-subtitle">Todos os registros</span>
      </div>

      <div className="filter-area">
        <button
          className={`action-btn action-btn-info ${filtroAtivo ? "botao-ativo" : "botao-inativo"}`}
          onClick={toggleFiltro}
          type="button"
        >
          {FilterIcon}
          Filtrar por Data
        </button>

        {filtroAtivo && (
          <div className="filter-panel">
            <input className="input" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            <input className="input" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            <button className="action-btn action-btn-secondary" onClick={toggleBuscaData} type="button">
              {buscaDataAtiva ? "Voltar para Mês Atual" : "Ativar Busca no Extrato"}
            </button>
          </div>
        )}
      </div>

      <div className="extrato-list">
        {lancamentosOrdenados.map((item) => {
          const retro = isRetroativo(item.mes);

          return (
            <div key={item.id} className={`extrato-item ${item.tipo === "ENTRADA" ? "entrada" : "saida"}`}>
              <div className="extrato-left">
                <span className="descricao">
                  {item.embarcacao ? item.embarcacao : item.descricao}
                  {retro && <span className="badge-retroativo">Retroativo</span>}
                </span>
                <small>{formatarDataBR(item.data)}</small>
              </div>

              <span className="valor">{formatMoney(item.valor, false)}</span>

              <button className="icon-btn danger" onClick={() => handleApagarLancamento(item)} title="Apagar lançamento" type="button">
                🗑️
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  const retroativoPanel = (
    <div className="retroativo-panel">
      <div className="field-label">Data do Lançamento</div>
      <input className="input" type="date" value={dataTemp} onChange={(e) => setDataTemp(e.target.value)} />
      <button className="action-btn action-btn-secondary" onClick={confirmarData} type="button">
        Confirmar Data
      </button>
      <div className="helper-text">
        Data ativa: <strong>{formatarDataBR(dataLancamento)}</strong>
      </div>
      <div className="field-label">Descrição</div>
      <input className="input" placeholder="Descrição do lançamento" value={retroDescricao} onChange={(e) => setRetroDescricao(e.target.value)} />
      <div className="field-label">Tipo</div>
      <select className="input select" value={retroTipo} onChange={(e) => setRetroTipo(e.target.value)}>
        <option value="ENTRADA">Entrada</option>
        <option value="SAIDA">Saída</option>
      </select>
      <div className="field-label">Valor</div>
      <input className="input" type="number" placeholder="Valor" value={retroValor} onChange={(e) => setRetroValor(e.target.value)} />
      <button className="action-btn action-btn-warning" onClick={registrarRetroativo} type="button">
        Registrar Retroativo
      </button>
    </div>
  );

  return (
    <div className="app-shell">
      <Routes>
        <Route
          path="/"
          element={(
            <div className="dashboard">
              <aside className="sidebar">
                <div className="sidebar-brand">
                  <img className="sidebar-logo" src={logoGelato} alt="Gelato Tamandare" />
                  <div className="sidebar-title">Gelato Tamandaré</div>
                  <div className="sidebar-subtitle">Painel de gestão</div>
                </div>

                <div className="sidebar-nav">
                  <button className={`sidebar-btn ${tela === "pdv" ? "is-active" : ""}`} onClick={() => setTela("pdv")} type="button">
                    PDV
                  </button>
                  <button className={`sidebar-btn ${tela === "fluxo" ? "is-active" : ""}`} onClick={() => setTela("fluxo")} type="button">
                    Fluxo de Caixa
                  </button>
                  <button className={`sidebar-btn ${tela === "estoque" ? "is-active" : ""}`} onClick={() => setTela("estoque")} type="button">
                    Estoque
                  </button>
                  <button className={`sidebar-btn ${tela === "atendentes" ? "is-active" : ""}`} onClick={() => setTela("atendentes")} type="button">
                    Atendentes
                  </button>
                  <button className={`sidebar-btn ${tela === "relatorio" ? "is-active" : ""}`} onClick={() => setTela("relatorio")} type="button">
                    Relatório
                  </button>
                </div>
              </aside>

              <main className="content">
                {tela === "pdv" && <TelaCaixa uid={user.uid} dataHoje={hojeISO()} />}
                {tela === "fluxo" && <TelaFluxoCaixa uid={user.uid} dataHoje={hojeISO()} />}
                {tela === "estoque" && <TelaEstoque uid={user.uid} />}
                {tela === "atendentes" && <TelaAtendentes uid={user.uid} />}
                {tela === "relatorio" && <TelaRelatorio uid={user.uid} dataHoje={hojeISO()} />}
              </main>
            </div>
          )}
        />
        <Route
          path="/extrato"
          element={(
            <div className="app-container">
              <div className="app-header app-header-extrato app-header-route">
                <div className="route-header-row">
                  <button className="icon-btn" onClick={voltarExtrato} type="button">
                    ←
                  </button>
                  <div className="header-title-block">
                    <div className="app-title">Extrato</div>
                    <div className="app-date">{formatarDataHeader(hojeISO())}</div>
                  </div>
                  <div className="header-spacer" />
                </div>
              </div>
              {extratoSection}
              <div className="section-card secondary-tools">
                <button className="action-btn action-btn-warning" onClick={abrirRetroativo} type="button">
                  {ClockIcon}
                  Lançamento retroativo
                </button>
                <button className="action-btn action-btn-danger" onClick={exportarPDF} type="button">
                  Exportar PDF
                </button>
              </div>
              <button className="action-btn action-btn-secondary" onClick={voltarExtrato} type="button">
                Voltar
              </button>
            </div>
          )}
        />
        <Route
          path="/retroativo"
          element={(
            <div className="app-container">
              <div className="app-header app-header-extrato app-header-warning app-header-route">
                <div className="route-header-row">
                  <button className="icon-btn" onClick={voltarExtrato} type="button">
                    ←
                  </button>
                  <div className="header-title-block">
                    <div className="app-title">Lançamento Retroativo</div>
                    <div className="app-date">{formatarDataHeader(hojeISO())}</div>
                  </div>
                  <div className="header-spacer" />
                </div>
              </div>
              <div className="section-card secondary-tools">
                <div className="section-header section-header-main">
                  <div className="section-title">
                    <span className="section-icon warning">{ClockIcon}</span>
                    Definir Data
                  </div>
                  <span className="section-subtitle">Configurar lançamento</span>
                </div>
                {retroativoPanel}
              </div>
              <button className="action-btn action-btn-secondary" onClick={voltarExtrato} type="button">
                Voltar
              </button>
            </div>
          )}
        />
      </Routes>
    </div>
  );
}
