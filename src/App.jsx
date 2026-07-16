import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
import { buildAtendenteEmail } from "./services/loginsAtendentes";
import { getPanelAccess, savePanelAccess, subscribePanelAccess, updatePanelAccess } from "./services/panelAccess";
import { DEFAULT_LOJA, DEFAULT_LOJA_ID, subscribeLojas } from "./services/lojas";
import { getRoleLabel, isManagementRole, isSuperAdminRole, normalizeRole } from "./utils/access";
import { FiBarChart2, FiBox, FiCalendar, FiGrid, FiHeadphones, FiHome, FiLayers, FiLogOut, FiMenu, FiShoppingCart, FiTrendingUp, FiUser, FiUsers, FiX } from "react-icons/fi";
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
const TelaSuporte = lazy(() => import("./screens/Suporte"));
const TelaLojas = lazy(() => import("./screens/Lojas"));
const TelaRede = lazy(() => import("./screens/Rede"));

const LAST_LOGIN_EMAIL_KEY = "gelato-painel-last-email";
const DEPLOY_REDE_ID = String(import.meta.env.VITE_REDE_ID || "").trim();
const IS_CAFE_GUAJARA = DEPLOY_REDE_ID === "emporio";
const DEPLOY_LOJA_INICIAL_ID = String(import.meta.env.VITE_LOJA_INICIAL_ID || "").trim();
const DEPLOY_LOJA_FALLBACK = DEPLOY_REDE_ID === "emporio"
  ? { ...DEFAULT_LOJA, id: "emporio-cafe", nome: "cafe-guajara", nomeFantasia: "cafe-guajara", redeId: "emporio", logomarca: "" }
  : DEFAULT_LOJA;
const NAV_ITEMS = [
  { id: "gerencia", label: "Dashboard", icon: FiHome, gerenciaOnly: true },
  { id: "pdv", label: "PDV / Caixa", icon: FiShoppingCart },
  { id: "fluxo", label: "Fluxo de Caixa", icon: FiTrendingUp, gerenciaOnly: true },
  { id: "estoque", label: "Estoque", icon: FiBox, gerenciaOnly: true },
  { id: "atendentes", label: "Atendentes", icon: FiUsers, gerenciaOnly: true },
  { id: "relatorio", label: "Relatorios", icon: FiBarChart2, gerenciaOnly: true },
  { id: "rede", label: "Comparar unidades", icon: FiGrid, gerenciaOnly: true },
  { id: "suporte", label: "Suporte", icon: FiHeadphones, superadminOnly: true },
  { id: "lojas", label: "Unidades", icon: FiLayers, gerenciaOnly: true },
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

function readLastLoginEmail() {
  return window.localStorage.getItem(LAST_LOGIN_EMAIL_KEY) || "";
}

function writeLastLoginEmail(email) {
  window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, String(email || "").trim().toLowerCase());
}

export default function App() {
  const isTabletPortrait = false;
  const [tela, setTela] = useState("pdv");
  const [atendentes, setAtendentes] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [panelAccess, setPanelAccess] = useState(null);
  const [accessForm, setAccessForm] = useState(() => ({
    email: readLastLoginEmail(),
    senha: "",
  }));
  const [loginRole, setLoginRole] = useState("atendente");
  const [loginLoading, setLoginLoading] = useState(false);
  const [bootstrapForm, setBootstrapForm] = useState({
    atendenteId: "",
    email: "",
    senha: "",
    confirmarSenha: "",
  });
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
  const [isTabletLandscape, setIsTabletLandscape] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => hojeISO());
  const [maintenanceTapCount, setMaintenanceTapCount] = useState(0);
  const [maintenanceAccessUnlocked, setMaintenanceAccessUnlocked] = useState(false);
  const [lojas, setLojas] = useState([DEPLOY_LOJA_FALLBACK]);
  const [lojaAtivaId, setLojaAtivaId] = useState(() => window.localStorage.getItem(`acs-loja-ativa-${DEPLOY_REDE_ID || "acs"}`) || DEPLOY_LOJA_INICIAL_ID || DEFAULT_LOJA_ID);
  const [simulation, setSimulation] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    return subscribeLojas(DEPLOY_REDE_ID, setLojas);
  }, []);

  useEffect(() => {
    if (!lojas.length || lojas.some((item) => item.id === lojaAtivaId)) return;
    const lojaCadastrada = lojas.find((item) => item.id === DEPLOY_LOJA_INICIAL_ID) || lojas[0];
    setLojaAtivaId(lojaCadastrada.id);
    window.localStorage.setItem(`acs-loja-ativa-${DEPLOY_REDE_ID || "acs"}`, lojaCadastrada.id);
  }, [lojaAtivaId, lojas]);

  const lojaAtiva = useMemo(
    () => lojas.find((item) => item.id === lojaAtivaId) || { ...DEPLOY_LOJA_FALLBACK, id: lojaAtivaId },
    [lojaAtivaId, lojas]
  );
  const operationalUid = lojaAtiva.id;

  useEffect(() => {
    document.body.classList.toggle("theme-cafe-guajara", IS_CAFE_GUAJARA);
    return () => document.body.classList.remove("theme-cafe-guajara");
  }, []);

  useEffect(() => {
    document.title = lojaAtiva.nome || import.meta.env.VITE_APP_TITLE || "ACS";
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon && lojaAtiva.logomarca) {
      favicon.href = lojaAtiva.logomarca;
    } else if (favicon && IS_CAFE_GUAJARA) {
      favicon.href = "/guajara-192.png";
    }
  }, [lojaAtiva.logomarca, lojaAtiva.nome]);

  function selecionarLoja(id) {
    setLojaAtivaId(id);
    window.localStorage.setItem(`acs-loja-ativa-${DEPLOY_REDE_ID || "acs"}`, id);
    setTela("pdv");
  }

  function iniciarSimulacao(usuario) {
    selecionarLoja(usuario.lojaId);
    setSimulation(usuario);
    setTela("pdv");
  }

  useEffect(() => {
    function syncCurrentDate() {
      setCurrentDate(hojeISO());
    }

    syncCurrentDate();
    const intervalId = window.setInterval(syncCurrentDate, 60 * 1000);
    window.addEventListener("focus", syncCurrentDate);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncCurrentDate);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(pointer: coarse)");

    function isTabletViewport() {
      const menorLado = Math.min(window.innerWidth, window.innerHeight);
      return mediaQuery.matches && menorLado >= 600;
    }

    function isCompactLandscapeViewport() {
      return mediaQuery.matches
        && window.innerWidth >= 768
        && window.innerWidth <= 1366
        && window.innerWidth > window.innerHeight;
    }

    function atualizarOrientacao() {
      const tablet = isTabletViewport();
      const retrato = window.innerHeight > window.innerWidth;
      const paisagem = isCompactLandscapeViewport();
      setIsTabletLandscape(paisagem);
      setSidebarOpen((prev) => (paisagem ? prev : false));
      document.body.classList.toggle("tablet-device", tablet);
      document.body.classList.toggle("tablet-portrait", tablet && retrato);
      document.body.classList.toggle("tablet-landscape", paisagem);
    }

    atualizarOrientacao();

    window.addEventListener("resize", atualizarOrientacao);
    window.addEventListener("orientationchange", atualizarOrientacao);
    mediaQuery.addEventListener?.("change", atualizarOrientacao);

    return () => {
      window.removeEventListener("resize", atualizarOrientacao);
      window.removeEventListener("orientationchange", atualizarOrientacao);
      mediaQuery.removeEventListener?.("change", atualizarOrientacao);
      document.body.classList.remove("tablet-device", "tablet-portrait", "tablet-landscape");
    };
  }, []);

  useEffect(() => {
    const unsub = escutarLancamentosMes(operationalUid, mesSelecionado, setLancamentos);
    return () => unsub && unsub();
  }, [authUser?.uid, operationalUid, mesSelecionado]);

  useEffect(() => {
    const unsub = escutarTodosLancamentos(operationalUid, setTodosLancamentos);
    return () => unsub && unsub();
  }, [authUser?.uid, operationalUid]);

  useEffect(() => {
    const unsub = subscribeAtendentes(operationalUid, (items) => {
      setAtendentes(items);
    });
    return () => unsub && unsub();
  }, [authUser?.uid, operationalUid]);

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
    if (!authUser?.uid || !panelAccess || !isManagementRole(panelAccess.role) || !lojas.length) return;
    const lojaIds = lojas.map((item) => item.id).sort();
    const atuais = Array.isArray(panelAccess.lojaIds) ? [...panelAccess.lojaIds].map(String).sort() : [];
    if (lojaIds.length === atuais.length && lojaIds.every((id, index) => id === atuais[index])) return;
    updatePanelAccess(authUser.uid, { lojaIds }).catch((error) => console.error("Erro ao liberar unidades para a gerencia:", error));
  }, [authUser?.uid, lojas, panelAccess]);

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
    () => atendentesAtivos.find((item) => item.id === panelAccess?.atendenteId || (panelAccess?.id && item.authUid === panelAccess.id))
      || (isManagementRole(panelAccess?.role) ? panelAccess : null),
    [atendentesAtivos, panelAccess]
  );

  const forceScreens = typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("screenshots") === "true" || window.location.hash.includes("screenshots"));

  const accessRole = normalizeRole(simulation?.role || panelAccess?.role || accessUser?.role || (forceScreens ? "gerencia" : undefined));
  const effectiveAccessUser = simulation || accessUser;
  const podeAcessarEstoque = isManagementRole(accessRole)
    || Boolean(effectiveAccessUser?.podeGerenciarProdutos || panelAccess?.podeGerenciarProdutos);
  const painelLiberado = Boolean(authUser && panelAccess && accessUser && accessUser.ativo !== false) || forceScreens;
  const unitUnavailable = lojaAtiva.status && lojaAtiva.status !== "ativa";
  const maintenanceModeEnabled = unitUnavailable;
  const maintenanceScope = "total";
  const canBypassMaintenance = isSuperAdminRole(panelAccess?.role) && !simulation;
  const maintenanceBlocksEntireSystem = maintenanceModeEnabled && maintenanceScope === "total";
  const gerencialLiberado = painelLiberado && (!maintenanceModeEnabled || canBypassMaintenance);
  const navItems = useMemo(
    () =>
      NAV_ITEMS.filter(
        (item) =>
          item.id === "pdv"
          || (item.id === "estoque" && gerencialLiberado && podeAcessarEstoque)
          || (gerencialLiberado
            && (!item.gerenciaOnly || isManagementRole(accessRole))
            && (!item.superadminOnly || isSuperAdminRole(accessRole)))
      ),
    [accessRole, gerencialLiberado, podeAcessarEstoque]
  );
  const maintenanceLocked = maintenanceModeEnabled && !canBypassMaintenance;
  const maintenanceTitle = `${lojaAtiva.nome} indisponivel`;
  const maintenanceMessage = lojaAtiva.mensagemManutencao || "Unidade temporariamente indisponivel.";
  const maintenanceBannerVisible = false;
  const maintenanceScreenLocked = maintenanceLocked && maintenanceBlocksEntireSystem;
  const shouldShowBootstrap = !authUser && superadminsSemAcesso.length > 0;

  useEffect(() => {
    if (!maintenanceModeEnabled) {
      setMaintenanceTapCount(0);
      setMaintenanceAccessUnlocked(false);
      return;
    }

    if (canBypassMaintenance) {
      setMaintenanceTapCount(0);
      setMaintenanceAccessUnlocked(true);
      return;
    }

    setMaintenanceTapCount(0);
    setMaintenanceAccessUnlocked(false);
  }, [canBypassMaintenance, maintenanceModeEnabled]);

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
    if (!maintenanceLocked) return;
    setTela("pdv");
  }, [maintenanceLocked]);

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
    if (nextTela === "suporte") {
      navigate("/suporte");
      if (isTabletLandscape) {
        setSidebarOpen(false);
      }
      return;
    }

    if (location.pathname === "/suporte") {
      navigate("/");
    }
    setTela(nextTela);
    if (typeof window !== "undefined" && window.innerWidth <= 1023) {
      setSidebarOpen(false);
    }
    if (isTabletLandscape) {
      setSidebarOpen(false);
    }
  }

  function renderDashboard(activeTela) {
    const telaAtiva = activeTela === "suporte" ? "suporte" : tela;

    return (
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
            <button className="mobile-sidebar-close" type="button" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}><FiX /></button>
            <div className="sidebar-brand">
              <img
                className="sidebar-logo"
                src={lojaAtiva.logomarca || (IS_CAFE_GUAJARA ? "/guajara-192.png" : logoGelato)}
                alt={lojaAtiva.nome}
              />
              <div className="sidebar-title">{lojaAtiva.nome}</div>
              <div className="sidebar-subtitle">ACS · Painel de gestao</div>
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
                        ? "Entre com seu acesso ACS"
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
              ) : accessUser ? (
                <div className="sidebar-user-card">
                  <span className={`sidebar-user-avatar is-${accessUser.avatarTipo || "masculino"}`}>
                    {accessUser.fotoPerfil ? <img src={accessUser.fotoPerfil} alt={accessUser.nome} /> : <FiUser />}
                  </span>
                  <div><strong>{accessUser.nome}</strong><small>{getRoleLabel(accessRole)} · Online</small></div>
                </div>
              ) : (
                <form className="stack-form" onSubmit={entrarNoPainel}>
                  <input
                    className="input"
                    type="text"
                    value={accessForm.email}
                    onChange={(e) => setAccessForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Nome do atendente ou email"
                    autoComplete="username"
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
                {navItems.map((item) => {
                  const NavIcon = item.icon;
                  return (
                  <button
                    key={item.id}
                    className={`sidebar-btn ${telaAtiva === item.id ? "is-active" : ""}`}
                    onClick={() => handleSelectTela(item.id)}
                    type="button"
                    disabled={item.id !== "pdv" && !gerencialLiberado}
                  >
                    <NavIcon aria-hidden="true" /><span>{item.label}</span>
                  </button>
                  );
                })}
              </div>
            ) : null}
            {accessUser ? <button className="sidebar-exit-btn" type="button" onClick={sairDoPainel}><FiLogOut /> Sair do sistema</button> : null}
          </aside>

          <header className="app-topbar">
            <button className="topbar-menu-btn" type="button" aria-label="Abrir menu" onClick={() => setSidebarOpen((prev) => !prev)}><FiMenu /></button>
            <div className="topbar-greeting"><strong>Ola, {effectiveAccessUser?.nome || "Usuario"}! 👋</strong><span>Bem vindo ao ACS Sistemas</span></div>
            <div className="topbar-actions">
              {isManagementRole(accessRole) && lojas.length > 1 ? (
                <select className="input select topbar-store-select" value={lojaAtivaId} onChange={(event) => selecionarLoja(event.target.value)} aria-label="Escolher unidade">
                  {lojas.filter((item) => isSuperAdminRole(accessRole) || item.status === "ativa").map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                </select>
              ) : null}
              <span className="topbar-date"><FiCalendar /> {formatarDataBR(currentDate)}</span><span className={`topbar-avatar is-${effectiveAccessUser?.avatarTipo || "masculino"}`}>{effectiveAccessUser?.fotoPerfil ? <img src={effectiveAccessUser.fotoPerfil} alt={effectiveAccessUser.nome} /> : <FiUser />}</span>
            </div>
          </header>

          <main className="content">
            {telaAtiva === "pdv" && painelLiberado ? (
              <Suspense fallback={<div className="section-card">Carregando tela...</div>}>
                <TelaCaixa
                  uid={operationalUid}
                  dataHoje={currentDate}
                  accessRole={isManagementRole(accessRole) ? accessRole : "atendente"}
                  accessUser={effectiveAccessUser}
                  loja={lojaAtiva}
                  compactMode={IS_CAFE_GUAJARA}
                />
              </Suspense>
            ) : gerencialLiberado ? (
              <Suspense fallback={<div className="section-card">Carregando tela...</div>}>
                {telaAtiva === "gerencia" && (
                  <TelaGerencia
                    uid={operationalUid}
                    dataHoje={currentDate}
                    onNavigate={handleSelectTela}
                    accessUser={effectiveAccessUser}
                  />
                )}
                {telaAtiva === "fluxo" && <TelaFluxoCaixa uid={operationalUid} dataHoje={currentDate} loja={lojaAtiva} />}
                {telaAtiva === "estoque" && <TelaEstoque uid={operationalUid} loja={lojaAtiva} lojas={lojas} />}
                {telaAtiva === "atendentes" && <TelaAtendentes uid={operationalUid} accessUser={effectiveAccessUser} lojas={lojas} />}
                {telaAtiva === "lojas" && <TelaLojas lojaAtivaId={lojaAtivaId} onSelectLoja={selecionarLoja} redeId={DEPLOY_REDE_ID} onSimulate={iniciarSimulacao} canManageAvailability={isSuperAdminRole(accessRole)} />}
                {telaAtiva === "rede" && <TelaRede lojas={lojas} />}
                {telaAtiva === "relatorio" && (
                  <TelaRelatorio
                    uid={operationalUid}
                    dataHoje={currentDate}
                    accessUser={effectiveAccessUser}
                    loja={lojaAtiva}
                  />
                )}
                {telaAtiva === "suporte" && (
                  <TelaSuporte accessRole={accessRole} authUser={authUser} />
                )}
              </Suspense>
            ) : (
              <div className="dashboard-screen">
                <div className="section-card access-block-card">
                  <div className="section-header section-header-main">
                  <div className="section-title">Painel bloqueado</div>
                    <span className="section-subtitle">
                      {maintenanceLocked
                        ? "Somente superadmin pode acessar o gerencial durante a manutencao"
                        : "Entre com um usuario autenticado para continuar"}
                    </span>
                  </div>
                  <p className="screen-description">
                    {maintenanceLocked
                      ? "O PDV continua disponivel. As telas gerenciais ficam bloqueadas ate que um superadmin entre no painel."
                      : "O PDV continua disponivel. As telas gerenciais exigem acesso autenticado com email e senha."}
                  </p>
                </div>
              </div>
            )}
          </main>
          <nav className="mobile-bottom-nav" aria-label="Navegacao principal">
            {navItems.filter((item) => ["gerencia", "pdv", "estoque", "relatorio"].includes(item.id)).map((item) => {
              const BottomIcon = item.icon;
              return <button key={item.id} className={telaAtiva === item.id ? "is-active" : ""} type="button" onClick={() => handleSelectTela(item.id)}><BottomIcon /><span>{item.id === "gerencia" ? "Inicio" : item.label.replace(" / Caixa", "")}</span></button>;
            })}
            <button type="button" onClick={() => setSidebarOpen(true)}><FiMenu /><span>Mais</span></button>
          </nav>
        </div>
        {SystemFooter}
      </>
    );
  }

  function handleMaintenanceTap() {
    if (maintenanceAccessUnlocked || !maintenanceLocked) return;
    setMaintenanceTapCount((prev) => {
      const nextCount = prev + 1;
      if (nextCount >= 6) {
        setMaintenanceAccessUnlocked(true);
        return 6;
      }
      return nextCount;
    });
  }

  function renderMaintenanceLockScreen() {
    const totalMode = maintenanceScope === "total";
    return (
      <div
        className={`maintenance-lock-screen ${totalMode ? "is-total" : "is-partial"}`}
        role={totalMode ? "alert" : "status"}
        aria-live={totalMode ? "assertive" : "polite"}
        data-taps={maintenanceTapCount}
        onClick={handleMaintenanceTap}
      >
        <div className="maintenance-lock-content">
          <strong className="maintenance-lock-title">
            {maintenanceTitle || "Modo manutencao ativo"}
          </strong>
          <p className="maintenance-lock-note">
            {totalMode
              ? maintenanceMessage || "Sistema temporariamente indisponivel."
              : "O PDV segue operante. O acesso gerencial esta bloqueado e liberado apenas para superadmin."}
          </p>
          {maintenanceAccessUnlocked ? (
              <div
                className="maintenance-login-shell"
                onClick={(e) => e.stopPropagation()}
              >
                <form className="stack-form maintenance-login-form" onSubmit={entrarNoPainel}>
                  <input
                    className="input maintenance-login-input"
                    type="email"
                    value={accessForm.email}
                    onChange={(e) => setAccessForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Email do superadmin"
                    aria-label="Email do superadmin"
                  />
                  <input
                    className="input maintenance-login-input"
                    type="password"
                    value={accessForm.senha}
                    onChange={(e) => setAccessForm((prev) => ({ ...prev, senha: e.target.value }))}
                    placeholder="Senha do superadmin"
                    aria-label="Senha do superadmin"
                  />
                  <button className="maintenance-login-button" type="submit">
                    Liberar gerencial
                  </button>
                  {accessError ? <p className="inline-feedback">{accessError}</p> : null}
                </form>
              </div>
          ) : (
            <p className="maintenance-lock-note">
              {totalMode
                ? "Toque 6 vezes nesta tela para abrir o login de superadmin."
                : "Toque 6 vezes nesta faixa para abrir o login de superadmin."}
            </p>
          )}
        </div>
      </div>
    );
  }

  async function registrarRetroativo() {
    const v = Number(retroValor);
    if (!Number.isFinite(v) || v <= 0) return;

    const data = dataLancamento || hojeISO();
    const mes = getMonthFromDate(data);
    const descricao = (retroDescricao || "Lancamento Retroativo").trim();
    const tipo = retroTipo === "ENTRADA" ? "ENTRADA" : "SAIDA";

    await criarLancamento({
      uid: operationalUid,
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
      await apagarLancamento(operationalUid, item.id);
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
    const identificacao = String(accessForm.email || "").trim();
    const senha = String(accessForm.senha || "");

    if (!identificacao || !senha) {
      setAccessError("Informe seu nome ou email e a senha para entrar.");
      return;
    }

    try {
      setLoginLoading(true);
      const loginPorEmail = identificacao.includes("@");
      const email = loginPorEmail
        ? identificacao.toLowerCase()
        : buildAtendenteEmail(operationalUid, identificacao);
      const credencial = await loginPainel(email, senha);
      const acesso = await getPanelAccess(credencial.user.uid);

      if (!acesso || acesso.ativo === false) {
        await logoutPainel();
        throw new Error("Acesso inativo ou sem vinculo com o painel.");
      }
      if (normalizeRole(acesso.role) !== normalizeRole(loginRole)) {
        await logoutPainel();
        throw new Error(`Este usuario esta cadastrado como ${getRoleLabel(acesso.role)}.`);
      }
      if (!isSuperAdminRole(acesso.role)) {
        const lojasPermitidas = Array.isArray(acesso.lojaIds) ? acesso.lojaIds.map(String) : [];
        if (String(acesso.lojaId || "") !== operationalUid && !lojasPermitidas.includes(operationalUid)) {
          await logoutPainel();
          throw new Error("Este usuario nao pertence a unidade selecionada.");
        }
      }
      setPanelAccess(acesso);
      writeLastLoginEmail(identificacao);
      setAccessForm((prev) => ({ ...prev, senha: "" }));
      setAccessError("");
      setTela(loginPorEmail ? "gerencia" : "pdv");
    } catch (error) {
      console.error(error);
      setAccessError(error instanceof Error && error.message
        ? error.message
        : "Nao foi possivel entrar. Verifique os dados informados.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function sairDoPainel() {
    await logoutPainel();
    setPanelAccess(null);
    setAccessForm((prev) => ({ ...prev, senha: "" }));
    setTela("pdv");
  }

  function renderLoginScreen() {
    const lojasLogin = lojas.filter((loja) => loja.status !== "inativa");
    const loginPorNome = loginRole === "atendente";

    return (
      <main className="access-login-screen">
        <section className="access-login-card">
          <div className="access-login-heading">
            <span className="access-login-kicker">ACS Sistemas</span>
            <h1>Bem-vindo</h1>
            <p>Escolha a unidade e o seu perfil para acessar.</p>
          </div>

          <div className="access-brand-grid" aria-label="Escolha a unidade">
            {lojasLogin.map((loja) => {
              const isAcai = loja.id === "sorveteria-e-acai";
              return (
                <button
                  className={`access-brand-card ${loja.id === lojaAtivaId ? "is-selected" : ""}`}
                  type="button"
                  key={loja.id}
                  onClick={() => selecionarLoja(loja.id)}
                >
                  <span className="access-brand-logo">
                    <img src={loja.logomarca || logoGelato} alt="" />
                  </span>
                  <strong>{isAcai ? "Sabor Açaí" : loja.nome}</strong>
                  <small>{loja.id === lojaAtivaId ? "Unidade selecionada" : "Selecionar unidade"}</small>
                </button>
              );
            })}
          </div>

          <div className="access-role-picker" aria-label="Escolha o perfil">
            {[
              ["atendente", "Atendente"],
              ["gerencia", "Gerência"],
              ["superadmin", "Superadmin"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={loginRole === value ? "is-selected" : ""}
                onClick={() => {
                  setLoginRole(value);
                  setAccessError("");
                  setAccessForm({ email: "", senha: "" });
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <form className="access-login-form" onSubmit={entrarNoPainel}>
            <label>
              <span>{loginPorNome ? "Nome do atendente" : "E-mail de acesso"}</span>
              <input
                className="input"
                type={loginPorNome ? "text" : "email"}
                value={accessForm.email}
                onChange={(e) => setAccessForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder={loginPorNome ? "Ex.: Leticia Leal" : "seuemail@exemplo.com"}
                autoComplete="username"
                autoFocus
              />
            </label>
            <label>
              <span>Senha</span>
              <input
                className="input"
                type="password"
                value={accessForm.senha}
                onChange={(e) => setAccessForm((prev) => ({ ...prev, senha: e.target.value }))}
                placeholder="Digite sua senha"
                autoComplete="current-password"
              />
            </label>
            <button className="access-login-submit" type="submit" disabled={loginLoading}>
              {loginLoading ? "Entrando..." : `Entrar como ${getRoleLabel(loginRole)}`}
            </button>
            {accessError ? <p className="access-login-feedback">{accessError}</p> : null}
          </form>
        </section>
        {SystemFooter}
      </main>
    );
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

  if (authLoaded && !painelLiberado && !shouldShowBootstrap && !forceScreens) {
    return renderLoginScreen();
  }

  return (
    <div className={`app-shell ${simulation ? "simulation-readonly" : ""}`}>
      {simulation ? <div className="simulation-banner"><span>Simulacao somente leitura · {simulation.nome} · {simulation.role} · {simulation.lojaNome}</span><button type="button" onClick={() => setSimulation(null)}>Encerrar simulacao</button></div> : null}
      {maintenanceScreenLocked ? renderMaintenanceLockScreen() : null}
      {!maintenanceScreenLocked && isTabletPortrait ? (
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
      {!maintenanceScreenLocked && maintenanceBannerVisible ? renderMaintenanceLockScreen() : null}
      {!maintenanceScreenLocked ? (
      <Routes>
        <Route
          path="/"
          element={renderDashboard(tela)}
        />
        <Route path="/suporte" element={renderDashboard("suporte")} />
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
                    <div className="app-date">{formatarDataHeader(currentDate)}</div>
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
                    <div className="app-date">{formatarDataHeader(currentDate)}</div>
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
      ) : null}
    </div>
  );
}
