import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCheckCircle, FiMessageCircle, FiRefreshCw, FiSend, FiShield, FiX } from "react-icons/fi";
import {
  buscarConversasAbertas,
  enviarMensagemSuporte,
  escutarConversaSuporte,
  fecharConversaSuporte,
  responderConversaSuporte,
} from "../services/suporte";
import { isSuperAdminRole } from "../utils/access";

const PDV_SESSION_STORAGE_KEY = "gelato-caixa-atual";
const SUPPORT_OPEN_STORAGE_KEY = "gelato-support-widget-open";
const SUPPORT_ACTIVE_STORAGE_KEY = "gelato-support-widget-active";

function buildFallbackEmail(sessaoPdv) {
  const atendenteId = String(sessaoPdv?.atendenteId || "").trim().toLowerCase();
  if (!atendenteId) return "";
  return `${atendenteId}@pdv.local`;
}

function formatarMensagemTimestamp(valor) {
  if (!valor) return "";

  if (typeof valor?.toDate === "function") {
    return valor.toDate().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "";

  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readBooleanStorage(key, fallback = false) {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) === "true";
}

function readTextStorage(key, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) || fallback;
}

export default function ChatSuporte({ authUser, accessUser, panelAccess, accessRole }) {
  const [aberto, setAberto] = useState(() => readBooleanStorage(SUPPORT_OPEN_STORAGE_KEY, false));
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [respostaAdmin, setRespostaAdmin] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sessaoPdv, setSessaoPdv] = useState(null);
  const [filtroAdmin, setFiltroAdmin] = useState("abertas");
  const [conversasAdmin, setConversasAdmin] = useState([]);
  const [conversaAtivaId, setConversaAtivaId] = useState(() =>
    readTextStorage(SUPPORT_ACTIVE_STORAGE_KEY, "")
  );
  const [carregandoAdmin, setCarregandoAdmin] = useState(false);
  const [salvandoAdmin, setSalvandoAdmin] = useState(false);
  const [encerrandoAdmin, setEncerrandoAdmin] = useState(false);
  const fimRef = useRef(null);

  const superadmin = isSuperAdminRole(accessRole);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SUPPORT_OPEN_STORAGE_KEY, String(aberto));
  }, [aberto]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (conversaAtivaId) {
      window.localStorage.setItem(SUPPORT_ACTIVE_STORAGE_KEY, conversaAtivaId);
      return;
    }
    window.localStorage.removeItem(SUPPORT_ACTIVE_STORAGE_KEY);
  }, [conversaAtivaId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function atualizarSessaoPdv() {
      try {
        const raw = window.localStorage.getItem(PDV_SESSION_STORAGE_KEY);
        setSessaoPdv(raw ? JSON.parse(raw) : null);
      } catch {
        setSessaoPdv(null);
      }
    }

    atualizarSessaoPdv();
    window.addEventListener("focus", atualizarSessaoPdv);
    window.addEventListener("storage", atualizarSessaoPdv);

    return () => {
      window.removeEventListener("focus", atualizarSessaoPdv);
      window.removeEventListener("storage", atualizarSessaoPdv);
    };
  }, []);

  const usuarioUid = authUser?.uid || sessaoPdv?.accessUserId || sessaoPdv?.atendenteId || "";
  const usuarioEmail = String(
    authUser?.email || panelAccess?.email || buildFallbackEmail(sessaoPdv)
  )
    .trim()
    .toLowerCase();
  const usuarioNome = useMemo(() => {
    return (
      String(
        accessUser?.nome ||
        panelAccess?.nome ||
        sessaoPdv?.atendenteNome ||
        authUser?.displayName ||
        ""
      ).trim() ||
      usuarioEmail
    );
  }, [accessUser?.nome, authUser?.displayName, panelAccess?.nome, sessaoPdv?.atendenteNome, usuarioEmail]);

  const adminEmail = String(authUser?.email || panelAccess?.email || "").trim().toLowerCase();
  const conversaAtivaAdmin = useMemo(
    () => conversasAdmin.find((item) => item.id === conversaAtivaId) || null,
    [conversaAtivaId, conversasAdmin]
  );
  const podeMostrar = superadmin ? Boolean(authUser && panelAccess) : Boolean(authUser || sessaoPdv?.id);

  const carregarConversasAdmin = useCallback(async () => {
    if (!superadmin) return;

    setCarregandoAdmin(true);
    setErro("");

    try {
      const items = await buscarConversasAbertas({ status: filtroAdmin });
      setConversasAdmin(items);
      if (!items.some((item) => item.id === conversaAtivaId)) {
        setConversaAtivaId(items[0]?.id || "");
      }
    } catch (error) {
      console.error(error);
      setErro("Nao foi possivel carregar as conversas do suporte.");
    } finally {
      setCarregandoAdmin(false);
    }
  }, [conversaAtivaId, filtroAdmin, superadmin]);

  useEffect(() => {
    if (!aberto || !podeMostrar) return undefined;

    if (superadmin) {
      carregarConversasAdmin().catch((error) => {
        console.error(error);
      });
      return undefined;
    }

    if (!usuarioUid) return undefined;

    setCarregando(true);
    setErro("");

    const unsubscribe = escutarConversaSuporte(
      usuarioUid,
      (items) => {
        setMensagens(items);
        setCarregando(false);
      },
      (error) => {
        console.error(error);
        setErro("Seu acesso ao suporte nao foi liberado ainda.");
        setCarregando(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [aberto, carregarConversasAdmin, podeMostrar, superadmin, usuarioUid]);

  useEffect(() => {
    if (!superadmin || !aberto || !conversaAtivaId) return undefined;

    setCarregando(true);
    const unsubscribe = escutarConversaSuporte(
      conversaAtivaId,
      (items) => {
        setMensagens(items);
        setCarregando(false);
      },
      (error) => {
        console.error(error);
        setErro("Nao foi possivel carregar a conversa selecionada.");
        setCarregando(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [aberto, conversaAtivaId, superadmin]);

  useEffect(() => {
    if (!aberto) return;

    fimRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [aberto, mensagens]);

  async function handleEnviarCliente(e) {
    e.preventDefault();

    if (!usuarioUid || !usuarioEmail) {
      setErro("Nao foi possivel identificar o atendente atual para abrir o suporte.");
      return;
    }

    setEnviando(true);
    setErro("");

    try {
      await enviarMensagemSuporte(usuarioEmail, usuarioUid, usuarioNome, texto);
      setTexto("");
      setAberto(true);
    } catch (error) {
      console.error(error);
      setErro("Nao foi possivel enviar sua mensagem agora. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleResponderAdmin(e) {
    e.preventDefault();
    if (!conversaAtivaId || !adminEmail) return;

    setSalvandoAdmin(true);
    setErro("");

    try {
      await responderConversaSuporte(conversaAtivaId, respostaAdmin, adminEmail);
      setRespostaAdmin("");
      await carregarConversasAdmin();
    } catch (error) {
      console.error(error);
      setErro("Nao foi possivel enviar a resposta agora.");
    } finally {
      setSalvandoAdmin(false);
    }
  }

  async function handleFecharAdmin() {
    if (!conversaAtivaId) return;

    setEncerrandoAdmin(true);
    setErro("");

    try {
      await fecharConversaSuporte(conversaAtivaId);
      setRespostaAdmin("");
      await carregarConversasAdmin();
    } catch (error) {
      console.error(error);
      setErro("Nao foi possivel marcar a conversa como resolvida.");
    } finally {
      setEncerrandoAdmin(false);
    }
  }

  if (!podeMostrar) return null;

  return (
    <div className={`chat-suporte-root ${superadmin ? "is-admin" : ""}`}>
      {aberto ? (
        <section
          className={`chat-suporte-modal section-card ${superadmin ? "is-admin" : ""}`}
          aria-label={superadmin ? "Central de suporte" : "Conversa com suporte"}
        >
          <div className="chat-suporte-header">
            <div>
              <strong>{superadmin ? "Central de Suporte" : "Suporte"}</strong>
              <span>
                {superadmin
                  ? "Janela fixa para responder atendentes enquanto voce navega."
                  : "Fale com o suporte em tempo real."}
              </span>
            </div>
            <button
              className="chat-suporte-close"
              type="button"
              aria-label="Fechar suporte"
              onClick={() => setAberto(false)}
            >
              <FiX />
            </button>
          </div>

          {superadmin ? (
            <div className="chat-suporte-admin-shell">
              <div className="chat-suporte-admin-sidebar">
                <div className="chat-suporte-admin-toolbar">
                  <div className="chat-suporte-admin-filters">
                    <button
                      className={`chip ${filtroAdmin === "abertas" ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setFiltroAdmin("abertas")}
                    >
                      Abertas
                    </button>
                    <button
                      className={`chip ${filtroAdmin === "resolvidas" ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setFiltroAdmin("resolvidas")}
                    >
                      Resolvidas
                    </button>
                  </div>
                  <button
                    className="chat-suporte-refresh"
                    type="button"
                    aria-label="Atualizar conversas"
                    onClick={carregarConversasAdmin}
                  >
                    <FiRefreshCw />
                  </button>
                </div>

                <div className="chat-suporte-admin-list">
                  {carregandoAdmin ? (
                    <p className="chat-suporte-empty">Carregando conversas...</p>
                  ) : conversasAdmin.length ? (
                    conversasAdmin.map((conversa) => (
                      <button
                        key={conversa.id}
                        type="button"
                        className={`chat-suporte-admin-item ${conversaAtivaId === conversa.id ? "is-active" : ""}`}
                        onClick={() => setConversaAtivaId(conversa.id)}
                      >
                        <div>
                          <strong>{conversa.usuarioNome || conversa.usuarioEmail}</strong>
                          <small>{conversa.usuarioEmail}</small>
                          <small>{conversa.ultimaMensagemTexto || "Sem mensagem"}</small>
                        </div>
                        <span className={`chat-suporte-admin-badge ${conversa.ativo === false ? "is-closed" : ""}`}>
                          {conversa.ativo === false ? "Resolvida" : conversa.pendenteAdmin ? "Pendente" : "Respondida"}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="chat-suporte-empty">Nenhuma conversa para este filtro.</p>
                  )}
                </div>
              </div>

              <div className="chat-suporte-admin-panel">
                <div className="chat-suporte-body">
                  {conversaAtivaAdmin ? (
                    <>
                      <div className="chat-suporte-admin-heading">
                        <div>
                          <strong>{conversaAtivaAdmin.usuarioNome || conversaAtivaAdmin.usuarioEmail}</strong>
                          <span>{conversaAtivaAdmin.usuarioEmail}</span>
                        </div>
                        <span className="chat-suporte-admin-status">
                          {conversaAtivaAdmin.ativo === false ? "Resolvida" : "Em atendimento"}
                        </span>
                      </div>

                      {carregando ? (
                        <p className="chat-suporte-empty">Carregando conversa...</p>
                      ) : mensagens.length ? (
                        mensagens.map((mensagem) => {
                          const isAdmin = mensagem.tipoRemetente === "admin";

                          return (
                            <article
                              key={mensagem.id}
                              className={`chat-suporte-bubble ${isAdmin ? "is-admin" : "is-user"}`}
                            >
                              <strong>{isAdmin ? "Superadmin" : conversaAtivaAdmin.usuarioNome || "Atendente"}</strong>
                              <p>{mensagem.texto}</p>
                              <small>{formatarMensagemTimestamp(mensagem.timestamp)}</small>
                            </article>
                          );
                        })
                      ) : (
                        <p className="chat-suporte-empty">Essa conversa ainda nao tem mensagens.</p>
                      )}
                    </>
                  ) : (
                    <p className="chat-suporte-empty">Selecione uma conversa para responder.</p>
                  )}
                  <div ref={fimRef} />
                </div>

                {conversaAtivaAdmin ? (
                  <form className="chat-suporte-form" onSubmit={handleResponderAdmin}>
                    <textarea
                      className="input chat-suporte-textarea"
                      rows="3"
                      value={respostaAdmin}
                      onChange={(e) => setRespostaAdmin(e.target.value)}
                      placeholder="Responder atendente"
                      disabled={salvandoAdmin || conversaAtivaAdmin.ativo === false}
                    />
                    <div className="chat-suporte-actions is-admin">
                      <button
                        className="action-btn action-btn-warning"
                        type="button"
                        onClick={handleFecharAdmin}
                        disabled={encerrandoAdmin || conversaAtivaAdmin.ativo === false}
                      >
                        <FiCheckCircle />
                        {encerrandoAdmin ? "Fechando..." : "Resolver"}
                      </button>
                      <button
                        className="action-btn action-btn-primary"
                        type="submit"
                        disabled={salvandoAdmin || !respostaAdmin.trim() || conversaAtivaAdmin.ativo === false}
                      >
                        <FiSend />
                        {salvandoAdmin ? "Enviando..." : "Responder"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="chat-suporte-body">
                {carregando ? (
                  <p className="chat-suporte-empty">Carregando conversa...</p>
                ) : mensagens.length ? (
                  mensagens.map((mensagem) => {
                    const minhaMensagem = mensagem.tipoRemetente !== "admin";

                    return (
                      <article
                        key={mensagem.id}
                        className={`chat-suporte-bubble ${minhaMensagem ? "is-user" : "is-admin"}`}
                      >
                        <strong>{minhaMensagem ? "Voce" : "Suporte"}</strong>
                        <p>{mensagem.texto}</p>
                        <small>{formatarMensagemTimestamp(mensagem.timestamp)}</small>
                      </article>
                    );
                  })
                ) : (
                  <p className="chat-suporte-empty">
                    Envie a primeira mensagem para abrir sua conversa com o suporte.
                  </p>
                )}
                <div ref={fimRef} />
              </div>

              <form className="chat-suporte-form" onSubmit={handleEnviarCliente}>
                <textarea
                  className="input chat-suporte-textarea"
                  rows="3"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Digite sua mensagem"
                  disabled={enviando}
                />
                <div className="chat-suporte-actions">
                  {erro ? (
                    <p className="inline-feedback">{erro}</p>
                  ) : (
                    <span className="helper-text">Resposta em tempo real quando o suporte estiver aberto.</span>
                  )}
                  <button className="action-btn action-btn-primary" type="submit" disabled={enviando || !texto.trim()}>
                    <FiSend />
                    {enviando ? "Enviando..." : "Enviar"}
                  </button>
                </div>
              </form>
            </>
          )}

          {superadmin && erro ? <p className="inline-feedback chat-suporte-admin-feedback">{erro}</p> : null}
        </section>
      ) : null}

      <button
        className={`chat-suporte-trigger ${superadmin ? "is-admin" : ""}`}
        type="button"
        aria-label={superadmin ? "Abrir central de suporte" : "Abrir suporte"}
        onClick={() => setAberto((prev) => !prev)}
      >
        {superadmin ? <FiShield /> : <FiMessageCircle />}
      </button>
    </div>
  );
}
