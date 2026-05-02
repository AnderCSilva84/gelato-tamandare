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
import { subscribeAtendentes } from "./services/atendentes";
import TelaAtendentes from "./screens/Atendentes";
import TelaCaixa from "./screens/Caixa";
import TelaEstoque from "./screens/Estoque";
import TelaFluxoCaixa from "./screens/FluxoCaixa";
import TelaGerencia from "./screens/Gerencia";
import TelaRelatorio from "./screens/Relatorio";
import logoGelato from "./assets/gelatoimg.jpeg";
import "./styles/glass.css";
import "./styles.css";
import "./styles/responsive.css";

const TEMP_USER = { uid: "gelato-local" };
const ACCESS_STORAGE_KEY = "gelato-painel-access";
const NAV_ITEMS = [
  { id: "gerencia", label: "Gerencia", gerenciaOnly: true },
  { id: "pdv", label: "PDV" },
  { id: "fluxo", label: "Fluxo de Caixa", gerenciaOnly: true },
  { id: "estoque", label: "Estoque", gerenciaOnly: true },
  { id: "atendentes", label: "Atendentes", gerenciaOnly: true },
  { id: "relatorio", label: "Relatorio", gerenciaOnly: true },
];

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
  if (ocultar) return "R$ .....";
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

function normalizeRole(role) {
  return role === "gerencia" ? "gerencia" : "atendente";
}

function readAccessSession() {
  try {
    const raw = window.localStorage.getItem(ACCESS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeAccessSession(session) {
  window.localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(session));
}

function clearAccessSession() {
  window.localStorage.removeItem(ACCESS_STORAGE_KEY);
}

export default function App() {
  const [user] = useState(TEMP_USER);
  const [tela, setTela] = useState("pdv");
  const [pdvCaixaAberto, setPdvCaixaAberto] = useState(false);
  const [openRetiradaSignal, setOpenRetiradaSignal] = useState(0);
  const [atendentes, setAtendentes] = useState([]);
  const [accessForm, setAccessForm] = useState({ atendenteId: "", senha: "" });
  const [accessUserId, setAccessUserId] = useState(() => readAccessSession()?.id || "");
  const [accessError, setAccessError] = useState("");
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

  useEffect(() => {
    const unsub = subscribeAtendentes(user.uid, setAtendentes);
    return () => unsub && unsub();
  }, [user.uid]);

  const atendentesAtivos = useMemo(
    () => atendentes.filter((item) => item.ativo !== false),
    [atendentes]
  );
  const hasGerencia = useMemo(
    () => atendentesAtivos.some((item) => normalizeRole(item.role) === "gerencia"),
    [atendentesAtivos]
  );
  const unrestrictedSetup = !hasGerencia;
  const accessUser = useMemo(
    () => atendentesAtivos.find((item) => item.id === accessUserId) || null,
    [accessUserId, atendentesAtivos]
  );
  const accessRole = normalizeRole(accessUser?.role);
  const painelLiberado = unrestrictedSetup || Boolean(accessUser);
  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => unrestrictedSetup || accessRole === "gerencia" || !item.gerenciaOnly),
    [accessRole, unrestrictedSetup]
  );

  useEffect(() => {
    if (unrestrictedSetup) {
      clearAccessSession();
      if (accessUserId) {
        setAccessUserId("");
      }
      return;
    }

    if (accessUserId && !accessUser) {
      clearAccessSession();
      setAccessUserId("");
      setAccessError("Seu acesso expirou. Entre novamente.");
    }
  }, [accessUser, accessUserId, unrestrictedSetup]);

  useEffect(() => {
    if (!navItems.some((item) => item.id === tela)) {
      setTela("pdv");
    }
  }, [navItems, tela]);

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
    const descricao = (retroDescricao || "Lancamento Retroativo").trim();
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
      `Apagar este lancamento?\n\n${formatarDataBR(item.data)} - ${item.descricao}\n${item.tipo} - ${formatMoney(item.valor, false)}`
    );
    if (!confirma) return;

    try {
      await apagarLancamento(user.uid, item.id);
      setLancamentos((prev) => prev.filter((atual) => atual.id !== item.id));
      setTodosLancamentos((prev) => prev.filter((atual) => atual.id !== item.id));
    } catch (err) {
      console.error(err);
      alert("Nao foi possivel apagar. Verifique sua conexao e tente novamente.");
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
        ? `Periodo: ${formatarDataBR(dataInicio)} ate ${formatarDataBR(dataFim)}`
        : `Periodo: Mes ${mesSelecionado}`;
    doc.text(periodoTexto, 14, y);

    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text("Data", 14, y);
    doc.text("Descricao", 42, y);
    doc.text("Entrada", 140, y, { align: "right" });
    doc.text("Saida", 166, y, { align: "right" });
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

      doc.setTextColor(
        item.tipo === "ENTRADA" ? 22 : 185,
        item.tipo === "ENTRADA" ? 101 : 28,
        item.tipo === "ENTRADA" ? 52 : 28
      );
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
    doc.text("Total de Saidas:", 14, y);
    doc.text(totalSaidas.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), 180, y, { align: "right" });

    y += 9;
    const corTotal = totalFinal >= 0 ? [22, 101, 52] : [185, 28, 28];
    doc.setTextColor(corTotal[0], corTotal[1], corTotal[2]);
    doc.setFontSize(12);
    doc.text("TOTAL FINAL:", 14, y);
    doc.text(totalFinal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), 180, y, { align: "right" });

    doc.save(`extrato-${mesSelecionado}.pdf`);
  }

  function entrarNoPainel(e) {
    e.preventDefault();
    const atendente = atendentesAtivos.find((item) => item.id === accessForm.atendenteId);

    if (!atendente) {
      setAccessError("Selecione um usuario ativo.");
      return;
    }

    const senhaCadastrada = String(atendente.senha || "");
    const senhaInformada = String(accessForm.senha || "");

    if (senhaCadastrada && senhaCadastrada !== senhaInformada) {
      setAccessError("Senha invalida.");
      return;
    }

    const session = {
      id: atendente.id,
      nome: atendente.nome,
      role: normalizeRole(atendente.role),
    };

    writeAccessSession(session);
    setAccessUserId(atendente.id);
    setAccessForm({ atendenteId: "", senha: "" });
    setAccessError("");
    setTela(session.role === "gerencia" ? "gerencia" : "pdv");
  }

  function sairDoPainel() {
    clearAccessSession();
    setAccessUserId("");
    setAccessForm({ atendenteId: "", senha: "" });
    setTela("pdv");
  }

  const extratoSection = (
    <div className="section-card">
      <div className="section-header section-header-main">
        <div className="section-title">
          <span className="section-icon info">{HistoryIcon}</span>
          Historico de Lancamentos
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
              {buscaDataAtiva ? "Voltar para Mes Atual" : "Ativar Busca no Extrato"}
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

              <button className="icon-btn danger" onClick={() => handleApagarLancamento(item)} title="Apagar lancamento" type="button">
                X
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  const retroativoPanel = (
    <div className="retroativo-panel">
      <div className="field-label">Data do Lancamento</div>
      <input className="input" type="date" value={dataTemp} onChange={(e) => setDataTemp(e.target.value)} />
      <button className="action-btn action-btn-secondary" onClick={confirmarData} type="button">
        Confirmar Data
      </button>
      <div className="helper-text">
        Data ativa: <strong>{formatarDataBR(dataLancamento)}</strong>
      </div>
      <div className="field-label">Descricao</div>
      <input className="input" placeholder="Descricao do lancamento" value={retroDescricao} onChange={(e) => setRetroDescricao(e.target.value)} />
      <div className="field-label">Tipo</div>
      <select className="input select" value={retroTipo} onChange={(e) => setRetroTipo(e.target.value)}>
        <option value="ENTRADA">Entrada</option>
        <option value="SAIDA">Saida</option>
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
                  <div className="sidebar-title">Gelato Tamandare</div>
                  <div className="sidebar-subtitle">Painel de gestao</div>
                </div>

                <div className="sidebar-access section-card">
                  <div className="section-header section-header-main">
                    <div className="section-title mobile-hide">Acesso</div>
                    <span className="section-subtitle">
                      {unrestrictedSetup
                        ? "Modo configuracao ativo"
                        : accessUser
                          ? `${accessUser.nome} - ${accessRole === "gerencia" ? "Gerencia" : "Atendente"}`
                          : "Entre para liberar o painel"}
                    </span>
                  </div>

                  {unrestrictedSetup ? (
                    <p className="sidebar-access-note">
                      Cadastre pelo menos um usuario com role gerencia em Atendentes para ativar o controle de acesso.
                    </p>
                  ) : accessUser ? (
                    <div className="stack-form">
                      <button className="action-btn action-btn-secondary" type="button" onClick={sairDoPainel}>
                        Sair do painel
                      </button>
                      {tela === "pdv" && pdvCaixaAberto ? (
                        <button
                          className="action-btn action-btn-warning"
                          type="button"
                          onClick={() => setOpenRetiradaSignal((prev) => prev + 1)}
                        >
                          Retirada
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <form className="stack-form" onSubmit={entrarNoPainel}>
                      <select
                        className="input select"
                        value={accessForm.atendenteId}
                        onChange={(e) =>
                          setAccessForm((prev) => ({ ...prev, atendenteId: e.target.value }))
                        }
                      >
                        <option value="">Selecione o usuario</option>
                        {atendentesAtivos.map((atendente) => (
                          <option key={atendente.id} value={atendente.id}>
                            {atendente.nome} - {normalizeRole(atendente.role) === "gerencia" ? "Gerencia" : "Atendente"}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        type="password"
                        value={accessForm.senha}
                        onChange={(e) => setAccessForm((prev) => ({ ...prev, senha: e.target.value }))}
                        placeholder="Senha"
                      />
                      <button className="action-btn action-btn-primary" type="submit">
                        Entrar no painel
                      </button>
                      {accessError ? <p className="inline-feedback">{accessError}</p> : null}
                    </form>
                  )}
                </div>

                {navItems.length > 1 ? (
                  <div className="sidebar-nav">
                    {navItems.map((item) => (
                      <button
                        key={item.id}
                        className={`sidebar-btn ${tela === item.id ? "is-active" : ""}`}
                        onClick={() => setTela(item.id)}
                        type="button"
                        disabled={!painelLiberado}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </aside>

              <main className="content">
                {painelLiberado ? (
                  <>
                    {tela === "gerencia" && (
                      <TelaGerencia uid={user.uid} dataHoje={hojeISO()} onNavigate={setTela} />
                    )}
                    {tela === "pdv" && (
                      <TelaCaixa
                        uid={user.uid}
                        dataHoje={hojeISO()}
                        accessRole={unrestrictedSetup ? "gerencia" : accessRole}
                        onCaixaStatusChange={setPdvCaixaAberto}
                        openRetiradaSignal={openRetiradaSignal}
                      />
                    )}
                    {tela === "fluxo" && <TelaFluxoCaixa uid={user.uid} dataHoje={hojeISO()} />}
                    {tela === "estoque" && <TelaEstoque uid={user.uid} />}
                    {tela === "atendentes" && <TelaAtendentes uid={user.uid} />}
                    {tela === "relatorio" && <TelaRelatorio uid={user.uid} dataHoje={hojeISO()} />}
                  </>
                ) : (
                  <div className="dashboard-screen">
                    <div className="section-card access-block-card">
                      <div className="section-header section-header-main">
                        <div className="section-title">Painel bloqueado</div>
                        <span className="section-subtitle">Entre com um usuario cadastrado para continuar</span>
                      </div>
                      <p className="screen-description">
                        Usuarios com role atendente acessam apenas o PDV. Usuarios com role gerencia acessam todo o sistema.
                      </p>
                    </div>
                  </div>
                )}
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
                    {"<-"}
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
                  Lancamento retroativo
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
                    {"<-"}
                  </button>
                  <div className="header-title-block">
                    <div className="app-title">Lancamento Retroativo</div>
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
                  <span className="section-subtitle">Configurar lancamento</span>
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
