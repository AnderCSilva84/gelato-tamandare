import { useCallback, useEffect, useMemo, useState } from "react";
import { FiHeadphones } from "react-icons/fi";
import {
  buscarConversasAbertas,
  escutarConversaSuporte,
  fecharConversaSuporte,
  responderConversaSuporte,
} from "../services/suporte";
import { isSuperAdminRole } from "../utils/access";

function formatarDataHora(valor) {
  if (!valor) return "Agora";

  if (typeof valor?.toDate === "function") {
    return valor.toDate().toLocaleString("pt-BR");
  }

  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "Agora";

  return data.toLocaleString("pt-BR");
}

export default function Suporte({ accessRole, authUser }) {
  const [filtro, setFiltro] = useState("abertas");
  const [conversas, setConversas] = useState([]);
  const [resumoAbertas, setResumoAbertas] = useState([]);
  const [conversaAtivaId, setConversaAtivaId] = useState("");
  const [mensagens, setMensagens] = useState([]);
  const [resposta, setResposta] = useState("");
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [salvandoResposta, setSalvandoResposta] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [feedback, setFeedback] = useState("");

  const podeAcessar = isSuperAdminRole(accessRole);
  const conversaAtiva = useMemo(
    () => conversas.find((item) => item.id === conversaAtivaId) || null,
    [conversaAtivaId, conversas]
  );
  const naoRespondidas = useMemo(
    () => resumoAbertas.filter((item) => item.pendenteAdmin).length,
    [resumoAbertas]
  );

  const carregarResumoAbertas = useCallback(async () => {
    const items = await buscarConversasAbertas({ status: "abertas" });
    setResumoAbertas(items);
  }, []);

  const carregarLista = useCallback(
    async (status) => {
      setCarregandoLista(true);
      setFeedback("");

      try {
        const items = await buscarConversasAbertas({ status });
        setConversas(items);
        if (!items.some((item) => item.id === conversaAtivaId)) {
          setConversaAtivaId(items[0]?.id || "");
        }
      } catch (error) {
        console.error(error);
        setFeedback("Nao foi possivel carregar as conversas do suporte.");
      } finally {
        setCarregandoLista(false);
      }
    },
    [conversaAtivaId]
  );

  useEffect(() => {
    if (!podeAcessar) return undefined;

    carregarResumoAbertas().catch((error) => {
      console.error(error);
    });
    carregarLista(filtro).catch((error) => {
      console.error(error);
    });

    return undefined;
  }, [carregarLista, carregarResumoAbertas, filtro, podeAcessar]);

  useEffect(() => {
    if (!podeAcessar || !conversaAtivaId) {
      setMensagens([]);
      return undefined;
    }

    setCarregandoMensagens(true);
    const unsubscribe = escutarConversaSuporte(conversaAtivaId, (items) => {
      setMensagens(items);
      setCarregandoMensagens(false);
    });

    return () => {
      unsubscribe();
    };
  }, [conversaAtivaId, podeAcessar]);

  async function atualizarPainel() {
    await carregarResumoAbertas();
    await carregarLista(filtro);
  }

  async function handleResponder(e) {
    e.preventDefault();
    if (!conversaAtivaId) return;

    setSalvandoResposta(true);
    setFeedback("");

    try {
      await responderConversaSuporte(
        conversaAtivaId,
        resposta,
        authUser?.email || "admin"
      );
      setResposta("");
      await atualizarPainel();
    } catch (error) {
      console.error(error);
      setFeedback("Nao foi possivel enviar a resposta agora.");
    } finally {
      setSalvandoResposta(false);
    }
  }

  async function handleFecharConversa() {
    if (!conversaAtivaId) return;

    setEncerrando(true);
    setFeedback("");

    try {
      await fecharConversaSuporte(conversaAtivaId);
      setResposta("");
      await atualizarPainel();
    } catch (error) {
      console.error(error);
      setFeedback("Nao foi possivel marcar a conversa como resolvida.");
    } finally {
      setEncerrando(false);
    }
  }

  if (!podeAcessar) {
    return (
      <div className="dashboard-screen">
        <div className="section-card access-block-card">
          <div className="section-header section-header-main">
            <div className="section-title">Suporte bloqueado</div>
            <span className="section-subtitle">Apenas o superadmin pode acessar</span>
          </div>
          <p className="screen-description">
            Seu perfil atual nao tem permissao para visualizar as conversas de suporte.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-screen">
      <div className="screen-heading section-card suporte-hero">
        <div>
          <h1 className="screen-title app-hero-title-blue screen-title-with-icon"><FiHeadphones /> Suporte</h1>
          <p className="screen-description">
            Atendimento em tempo real com leitura sob demanda por conversa.
          </p>
        </div>
        <div className="suporte-hero-badges">
          <span className="screen-badge">{naoRespondidas} aguardando resposta</span>
          <button className="action-btn action-btn-secondary" type="button" onClick={atualizarPainel}>
            Atualizar
          </button>
        </div>
      </div>

      <div className="suporte-toolbar section-card">
        <div className="suporte-toolbar-filters">
          <button
            className={`chip ${filtro === "abertas" ? "is-active" : ""}`}
            type="button"
            onClick={() => setFiltro("abertas")}
          >
            Abertas
          </button>
          <button
            className={`chip ${filtro === "resolvidas" ? "is-active" : ""}`}
            type="button"
            onClick={() => setFiltro("resolvidas")}
          >
            Resolvidas
          </button>
        </div>
        <span className="section-subtitle">
          {carregandoLista ? "Carregando..." : `${conversas.length} conversa(s)`}
        </span>
      </div>

      <div className="screen-grid suporte-grid">
        <div className="section-card suporte-list-card">
          <div className="section-header">
            <div className="section-title">Conversas</div>
            <span className="section-subtitle">Snapshot unico da lista</span>
          </div>

          <div className="scroll-list">
            {conversas.map((conversa) => (
              <button
                key={conversa.id}
                type="button"
                className={`suporte-list-item ${conversaAtivaId === conversa.id ? "is-active" : ""}`}
                onClick={() => setConversaAtivaId(conversa.id)}
              >
                <div>
                  <strong>{conversa.usuarioNome || conversa.usuarioEmail}</strong>
                  <small>{conversa.usuarioEmail}</small>
                  <small>{conversa.ultimaMensagemTexto || "Sem mensagens"}</small>
                </div>
                <div className="suporte-list-meta">
                  <span className={`suporte-status ${conversa.ativo === false ? "is-closed" : ""}`}>
                    {conversa.ativo === false ? "Resolvida" : conversa.pendenteAdmin ? "Pendente" : "Respondida"}
                  </span>
                  <small>{formatarDataHora(conversa.ultimaMensagem)}</small>
                </div>
              </button>
            ))}

            {!conversas.length && !carregandoLista ? (
              <p className="empty-state">Nenhuma conversa encontrada para este filtro.</p>
            ) : null}
          </div>
        </div>

        <div className="section-card suporte-chat-card">
          <div className="section-header">
            <div className="section-title">
              {conversaAtiva ? conversaAtiva.usuarioNome || "Conversa selecionada" : "Selecione uma conversa"}
            </div>
            <span className="section-subtitle">
              {conversaAtiva ? conversaAtiva.usuarioEmail : "Abra uma conversa para responder"}
            </span>
          </div>

          {conversaAtiva ? (
            <>
              <div className="suporte-messages">
                {carregandoMensagens ? (
                  <p className="empty-state">Carregando historico...</p>
                ) : mensagens.length ? (
                  mensagens.map((mensagem) => {
                    const isAdmin = mensagem.tipoRemetente === "admin";

                    return (
                      <article
                        key={mensagem.id}
                        className={`chat-suporte-bubble ${isAdmin ? "is-admin" : "is-user"}`}
                      >
                        <strong>{isAdmin ? "Suporte" : conversaAtiva.usuarioNome || "Cliente"}</strong>
                        <p>{mensagem.texto}</p>
                        <small>{formatarDataHora(mensagem.timestamp)}</small>
                      </article>
                    );
                  })
                ) : (
                  <p className="empty-state">Essa conversa ainda nao tem mensagens.</p>
                )}
              </div>

              <form className="stack-form suporte-response-form" onSubmit={handleResponder}>
                <textarea
                  className="input suporte-response-textarea"
                  rows="4"
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  placeholder="Responder conversa"
                  disabled={salvandoResposta || conversaAtiva.ativo === false}
                />
                <div className="suporte-response-actions">
                  <button
                    className="action-btn action-btn-primary"
                    type="submit"
                    disabled={salvandoResposta || !resposta.trim() || conversaAtiva.ativo === false}
                  >
                    {salvandoResposta ? "Enviando..." : "Responder"}
                  </button>
                  <button
                    className="action-btn action-btn-warning"
                    type="button"
                    onClick={handleFecharConversa}
                    disabled={encerrando || conversaAtiva.ativo === false}
                  >
                    {encerrando ? "Fechando..." : "Marcar como resolvida"}
                  </button>
                </div>
                {feedback ? <p className="inline-feedback">{feedback}</p> : null}
              </form>
            </>
          ) : (
            <p className="empty-state">Escolha uma conversa na coluna ao lado para ver o historico.</p>
          )}
        </div>
      </div>
    </div>
  );
}
