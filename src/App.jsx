import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import {
  apagarLancamento,
  criarLancamento,
  escutarLancamentosMes,
  escutarTodosLancamentos,
  hojeISO,
  mesISO,
} from "./services/lancamentos";
import { subscribeAtendentes, updateAtendente } from "./services/atendentes";
import { login as loginPainel, logout as logoutPainel, observeAuth, registerAndLogin } from "./services/auth";
import { savePanelAccess, subscribePanelAccess } from "./services/panelAccess";
import { DEFAULT_SYSTEM_CONFIG, subscribeSystemConfig } from "./services/sistema";
import { getRoleLabel, isManagementRole, isSuperAdminRole, normalizeRole } from "./utils/access";
import logoGelato from "./assets/gelatoimg.jpeg";
import "./styles/glass.css";
import "./styles.css";
import "./styles/responsive.css";

const TelaAtendentes = lazy(() => import("./screens/Atendentes"));
const TelaCaixa = lazy(() => import("./screens/Caixa"));
const TelaEstoque = lazy(() => import("./screens/Estoque"));
const TelaFluxoCaixa = lazy(() => import("./screens/FluxoCaixa"));
const TelaGerencia = lazy(() => import("./screens/Gerencia"));
const TelaRelatorio = lazy(() => import("./screens/Relatorio"));

const BUSINESS_USER = { uid: "gelato-local" };
const LAST_LOGIN_EMAIL_KEY = "gelato-painel-last-email";
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

const SystemFooter = (
  <footer className="system-footer">
    <div className="system-footer-line">Desenvolvido por Anderson C Silva</div>
    <div className="system-footer-line">ACS Informática</div>
  </footer>
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
  return `${dia}-${mes}-${ano}`;
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

function readLastLoginEmail() {
  return window.localStorage.getItem(LAST_LOGIN_EMAIL_KEY) || "";
}

function writeLastLoginEmail(email) {
  window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, String(email || "").trim().toLowerCase());
}

export default function App() {
  const [user] = useState(BUSINESS_USER);
  const [tela, setTela] = useState("pdv");
  const [atendentes, setAtendentes] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [panelAccess, setPanelAccess] = useState(null);
  const [accessForm, setAccessForm] = useState(() => ({
    email: readLastLoginEmail(),
    senha: "",
  }));
  const [bootstrapForm, setBootstrapForm] = useState({
    atendenteId: "",
    email: "",
    senha: "",
    confirmarSenha: "",
  });
  const [accessError, setAccessError] = useState("");
  const [systemConfig, setSystemConfig] = useState(DEFAULT_SYSTEM_CONFIG);
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
  const [isTabletPortrait, setIsTabletPortrait] = useState(false);
  const [isTabletLandscape, setIsTabletLandscape] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(pointer: coarse)");

    function isTabletViewport() {
      const menorLado = Math.min(window.innerWidth, window.innerHeight);
      return mediaQuery.matches && menorLado >= 600;
    }

    function isCompactLandscapeViewport() {
      return window.innerWidth >= 768 && window.innerWidth <= 1366 && window.innerWidth > window.innerHeight;
    }

    async function tentarPaisagem() {
      if (!isTabletViewport()) return;

      try {
        if (window.screen?.orientation?.lock) {
          await window.screen.orientation.lock("landscape");
        }
      } catch {
        // Ignora navegadores que nao permitem lock programatico fora do contexto suportado.
      }
    }

    function atualizarOrientacao() {
      const tablet = isTabletViewport();
      const retrato = window.innerHeight > window.innerWidth;
      const paisagem = isCompactLandscapeViewport();
      setIsTabletPortrait(tablet && retrato);
      setIsTabletLandscape(paisagem);
      setSidebarOpen((prev) => (paisagem ? prev : false));
      document.body.classList.toggle("tablet-device", tablet);
      document.body.classList.toggle("tablet-portrait", tablet && retrato);
      document.body.classList.toggle("tablet-landscape", paisagem);
    }

    const tentarPaisagemAoInteragir = () => {
      tentarPaisagem();
    };

    atualizarOrientacao();
    tentarPaisagem();

    window.addEventListener("resize", atualizarOrientacao);
    window.addEventListener("orientationchange", atualizarOrientacao);
    window.addEventListener("focus", tentarPaisagemAoInteragir);
    window.addEventListener("pointerdown", tentarPaisagemAoInteragir, { passive: true });

    return () => {
      window.removeEventListener("resize", atualizarOrientacao);
      window.removeEventListener("orientationchange", atualizarOrientacao);
      window.removeEventListener("focus", tentarPaisagemAoInteragir);
      window.removeEventListener("pointerdown", tentarPaisagemAoInteragir);
      document.body.classList.remove("tablet-device", "tablet-portrait", "tablet-landscape");
    };
  }, []);

  useEffect(() => {
    const unsub = escutarLancamentosMes(user.uid, mesSelecionado, setLancamentos);
    return () => unsub && unsub();
  }, [user.uid, mesSelecionado]);

  useEffect(() => {
    const unsub = escutarTodosLancamentos(user.uid, setTodosLancamentos);
    return () => unsub && unsub();
  }, [user.uid]);

  useEffect(() => {
    const unsub = subscribeAtendentes(user.uid, (items) => {
      setAtendentes(items);
    });
    return () => unsub && unsub();
  }, [user.uid]);

  useEffect(() => {
    const unsub = observeAuth((nextUser) => {
      setAuthUser(nextUser);
      setAuthLoaded(true);
    });
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribePanelAccess(authUser?.uid, setPanelAccess);
    return () => unsub && unsub();
  }, [authUser?.uid]);

  useEffect(() => {
    const unsub = subscribeSystemConfig(setSystemConfig);
    return () => unsub && unsub();
  }, []);

  const atendentesAtivos = useMemo(
    () => atendentes.filter((item) => item.ativo !== false),
    [atendentes]
  );
  const hasGerencia = useMemo(
    () => atendentesAtivos.some((item) => isManagementRole(item.role)),
    [atendentesAtivos]
  );
  const superadminsSemAcesso = useMemo(
    () =>
      atendentesAtivos.filter(
        (item) => isSuperAdminRole(item.role) && !String(item.authUid || "").trim()
      ),
    [atendentesAtivos]
  );
  const unrestrictedSetup = !hasGerencia;
  const accessUser = useMemo(
    () => atendentesAtivos.find((item) => item.id === panelAccess?.atendenteId) || null,
    [atendentesAtivos, panelAccess?.atendenteId]
  );
  const accessRole = normalizeRole(panelAccess?.role || accessUser?.role);
  const painelLiberado = Boolean(authUser && panelAccess && accessUser && accessUser.ativo !== false);
  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => item.id === "pdv" || painelLiberado),
    [painelLiberado]
  );
  const maintenanceAdmins = useMemo(
    () => atendentesAtivos.filter((item) => isSuperAdminRole(item.role)),
    [atendentesAtivos]
  );
  const maintenanceModeEnabled = systemConfig.maintenanceMode === true;
  const canBypassMaintenance = isSuperAdminRole(accessRole);
  const maintenanceLocked = maintenanceModeEnabled && !canBypassMaintenance;
  const maintenanceTitle = systemConfig.maintenanceTitle || DEFAULT_SYSTEM_CONFIG.maintenanceTitle;
  const maintenanceMessage = systemConfig.maintenanceMessage || DEFAULT_SYSTEM_CONFIG.maintenanceMessage;
  const shouldShowBootstrap = !authUser && superadminsSemAcesso.length > 0;

  useEffect(() => {
    if (!authLoaded) return;

    if (authUser && panelAccess && !accessUser) {
      setAccessError("Seu acesso ao painel nao esta mais vinculado a um usuario ativo.");
    }
  }, [accessUser, authLoaded, authUser, panelAccess]);

  useEffect(() => {
    if (!navItems.some((item) => item.id === tela)) {
      setTela("pdv");
    }
  }, [navItems, tela]);

  useEffect(() => {
    if (!maintenanceModeEnabled || !authUser || !panelAccess) return;
    if (isSuperAdminRole(panelAccess.role)) return;

    logoutPainel().catch((error) => console.error(error));
    setAccessError("Sistema em manutencao. Somente o superadmin pode acessar o painel.");
    setTela("pdv");
  }, [authUser, maintenanceModeEnabled, panelAccess]);

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

  function handleSelectTela(nextTela) {
    setTela(nextTela);
    if (isTabletLandscape) {
      setSidebarOpen(false);
    }
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
    import("jspdf").then(({ default: jsPDF }) => {
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
    });
  }

  async function entrarNoPainel(e) {
    e.preventDefault();
    const email = String(accessForm.email || "").trim().toLowerCase();
    const senha = String(accessForm.senha || "");

    if (!email || !senha) {
      setAccessError("Informe email e senha para entrar.");
      return;
    }

    try {
      await loginPainel(email, senha);
      writeLastLoginEmail(email);
      setAccessForm((prev) => ({ ...prev, senha: "" }));
      setAccessError("");
      setTela("gerencia");
    } catch (error) {
      console.error(error);
      setAccessError("Nao foi possivel entrar. Verifique email, senha e o acesso do painel.");
    }
  }

  async function sairDoPainel() {
    await logoutPainel();
    setPanelAccess(null);
    setAccessForm((prev) => ({ ...prev, senha: "" }));
    setTela("pdv");
  }

  async function configurarSuperadminInicial(e) {
    e.preventDefault();

    const atendente = atendentesAtivos.find((item) => item.id === bootstrapForm.atendenteId);
    const email = String(bootstrapForm.email || "").trim().toLowerCase();
    const senha = String(bootstrapForm.senha || "");
    const confirmarSenha = String(bootstrapForm.confirmarSenha || "");

    if (!atendente || !isSuperAdminRole(atendente.role)) {
      setAccessError("Selecione um usuario superadmin para o acesso inicial.");
      return;
    }

    if (!email || !senha) {
      setAccessError("Informe email e senha para criar o acesso inicial.");
      return;
    }

    if (senha !== confirmarSenha) {
      setAccessError("A confirmacao de senha nao confere.");
      return;
    }

    try {
      const cred = await registerAndLogin(email, senha);
      await savePanelAccess(cred.user.uid, {
        atendenteId: atendente.id,
        nome: atendente.nome,
        role: atendente.role,
        ativo: atendente.ativo !== false,
        email,
      });
      await updateAtendente(atendente.id, {
        authUid: cred.user.uid,
        emailAcesso: email,
      });
      writeLastLoginEmail(email);
      setBootstrapForm({ atendenteId: "", email: "", senha: "", confirmarSenha: "" });
      setAccessError("");
      setTela("gerencia");
    } catch (error) {
      console.error(error);
      setAccessError("Nao foi possivel configurar o acesso inicial do superadmin.");
    }
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
      {isTabletPortrait ? (
        <div className="tablet-orientation-guard" role="alert" aria-live="assertive">
          <div className="tablet-orientation-card">
            <div className="tablet-orientation-icon" aria-hidden="true">
              ↺
            </div>
            <strong>Gire o tablet para o modo paisagem</strong>
            <span>O GELATO foi ajustado para ocupar a tela inteira na horizontal, com zoom desativado.</span>
          </div>
        </div>
      ) : null}
      <Routes>
        <Route
          path="/"
          element={(
            <>
              <div className={`dashboard ${isTabletLandscape ? "dashboard-tablet-landscape" : ""}`}>
                {isTabletLandscape ? (
                  <>
                    <button
                      className="tablet-sidebar-toggle action-btn action-btn-secondary"
                      type="button"
                      onClick={() => setSidebarOpen((prev) => !prev)}
                    >
                      {sidebarOpen ? "Fechar menu" : "Abrir menu"}
                    </button>
                    {sidebarOpen ? (
                      <button
                        className="tablet-sidebar-backdrop"
                        type="button"
                        aria-label="Fechar menu lateral"
                        onClick={() => setSidebarOpen(false)}
                      />
                    ) : null}
                  </>
                ) : null}
                <aside className={`sidebar ${isTabletLandscape ? "sidebar-tablet-drawer" : ""} ${sidebarOpen ? "is-open" : ""}`}>
                  <div className="sidebar-brand">
                    <img className="sidebar-logo" src={logoGelato} alt="Gelato Tamandare" />
                    <div className="sidebar-title">Gelato Tamandare</div>
                    <div className="sidebar-subtitle">Painel de gestao</div>
                  </div>

                  <div className="sidebar-access section-card">
                    <div className="section-header section-header-main">
                      <div className="section-title mobile-hide">Acesso</div>
                      <span className="section-subtitle">
                        {maintenanceModeEnabled && !accessUser
                          ? "Modo manutencao ativo"
                          : shouldShowBootstrap
                            ? "Configurar superadmin inicial"
                          : unrestrictedSetup
                            ? "Modo configuracao ativo"
                          : accessUser
                            ? `${accessUser.nome} - ${getRoleLabel(accessRole)}`
                            : "Entre para liberar a gerencia"}
                      </span>
                    </div>

                    {shouldShowBootstrap ? (
                      <form className="stack-form" onSubmit={configurarSuperadminInicial}>
                        <select
                          className="input select"
                          value={bootstrapForm.atendenteId}
                          onChange={(e) =>
                            setBootstrapForm((prev) => ({ ...prev, atendenteId: e.target.value }))
                          }
                        >
                          <option value="">Selecione o superadmin</option>
                          {superadminsSemAcesso.map((atendente) => (
                            <option key={atendente.id} value={atendente.id}>
                              {atendente.nome} - Superadmin
                            </option>
                          ))}
                        </select>
                        <input
                          className="input"
                          type="email"
                          value={bootstrapForm.email}
                          onChange={(e) =>
                            setBootstrapForm((prev) => ({ ...prev, email: e.target.value }))
                          }
                          placeholder="Email do superadmin"
                        />
                        <input
                          className="input"
                          type="password"
                          value={bootstrapForm.senha}
                          onChange={(e) =>
                            setBootstrapForm((prev) => ({ ...prev, senha: e.target.value }))
                          }
                          placeholder="Senha de acesso ao painel"
                        />
                        <input
                          className="input"
                          type="password"
                          value={bootstrapForm.confirmarSenha}
                          onChange={(e) =>
                            setBootstrapForm((prev) => ({ ...prev, confirmarSenha: e.target.value }))
                          }
                          placeholder="Confirmar senha"
                        />
                        <button className="action-btn action-btn-primary" type="submit">
                          Criar acesso inicial
                        </button>
                        {accessError ? <p className="inline-feedback">{accessError}</p> : null}
                      </form>
                    ) : unrestrictedSetup ? (
                      <p className="sidebar-access-note">
                        Cadastre pelo menos um usuario com role gerencia ou superadmin em Atendentes para ativar o controle de acesso.
                      </p>
                    ) : accessUser ? (
                      <div className="sidebar-access-actions">
                        <button className="action-btn action-btn-secondary sidebar-access-btn" type="button" onClick={sairDoPainel}>
                          Sair do painel
                        </button>
                      </div>
                    ) : (
                      <form className="stack-form" onSubmit={entrarNoPainel}>
                        <input
                          className="input"
                          type="email"
                          value={accessForm.email}
                          onChange={(e) => setAccessForm((prev) => ({ ...prev, email: e.target.value }))}
                          placeholder="Email de acesso"
                        />
                        <input
                          className="input"
                          type="password"
                          value={accessForm.senha}
                          onChange={(e) => setAccessForm((prev) => ({ ...prev, senha: e.target.value }))}
                          placeholder="Senha de acesso"
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
                          onClick={() => handleSelectTela(item.id)}
                          type="button"
                          disabled={item.id !== "pdv" && !painelLiberado}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </aside>

                <main className="content">
                  {maintenanceLocked ? (
                    <div className="dashboard-screen maintenance-screen">
                      <div className="section-card access-block-card maintenance-card">
                        <div className="section-header section-header-main">
                          <div className="section-title">{maintenanceTitle}</div>
                          <span className="section-subtitle">Acesso temporariamente restrito</span>
                        </div>
                        <p className="screen-description">{maintenanceMessage}</p>
                        {maintenanceAdmins.length ? (
                          <>
                            <p className="helper-text">O superadmin ainda pode entrar para reativar o sistema.</p>
                            <form className="stack-form" onSubmit={entrarNoPainel}>
                              <input
                                className="input"
                                type="email"
                                value={accessForm.email}
                                onChange={(e) => setAccessForm((prev) => ({ ...prev, email: e.target.value }))}
                                placeholder="Email do superadmin"
                              />
                              <input
                                className="input"
                                type="password"
                                value={accessForm.senha}
                                onChange={(e) => setAccessForm((prev) => ({ ...prev, senha: e.target.value }))}
                                placeholder="Senha do superadmin"
                                />
                                <button className="action-btn action-btn-primary" type="submit">
                                  Entrar como superadmin
                                </button>
                              {accessError ? <p className="inline-feedback">{accessError}</p> : null}
                            </form>
                          </>
                          ) : (
                            <p className="inline-feedback">
                              Nenhum usuario superadmin esta disponivel para desativar a manutencao pelo painel.
                            </p>
                          )}
                      </div>
                    </div>
                  ) : tela === "pdv" ? (
                    <Suspense fallback={<div className="section-card">Carregando tela...</div>}>
                      <TelaCaixa
                        uid={user.uid}
                        dataHoje={hojeISO()}
                        accessRole={isManagementRole(accessRole) ? accessRole : "atendente"}
                        accessUser={accessUser}
                      />
                    </Suspense>
                  ) : painelLiberado ? (
                    <Suspense fallback={<div className="section-card">Carregando tela...</div>}>
                      {tela === "gerencia" && (
                        <TelaGerencia
                          uid={user.uid}
                          dataHoje={hojeISO()}
                          onNavigate={handleSelectTela}
                          accessUser={accessUser}
                          systemConfig={systemConfig}
                        />
                      )}
                      {tela === "pdv" && (
                        <TelaCaixa uid={user.uid} dataHoje={hojeISO()} accessRole={accessRole} accessUser={accessUser} />
                      )}
                      {tela === "fluxo" && <TelaFluxoCaixa uid={user.uid} dataHoje={hojeISO()} />}
                      {tela === "estoque" && <TelaEstoque uid={user.uid} />}
                      {tela === "atendentes" && <TelaAtendentes uid={user.uid} accessUser={accessUser} />}
                      {tela === "relatorio" && (
                        <TelaRelatorio
                          uid={user.uid}
                          dataHoje={hojeISO()}
                          accessUser={accessUser}
                        />
                      )}
                    </Suspense>
                  ) : (
                    <div className="dashboard-screen">
                      <div className="section-card access-block-card">
                        <div className="section-header section-header-main">
                          <div className="section-title">Painel bloqueado</div>
                          <span className="section-subtitle">Entre com um usuario autenticado para continuar</span>
                        </div>
                        <p className="screen-description">
                          O PDV continua disponivel. As telas gerenciais exigem acesso autenticado com email e senha.
                        </p>
                      </div>
                    </div>
                  )}
                </main>
              </div>
              {SystemFooter}
            </>
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
              {SystemFooter}
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
              {SystemFooter}
            </div>
          )}
        />
      </Routes>
    </div>
  );
}
