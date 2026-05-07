import { useEffect, useMemo, useState } from "react";
import {
  addAtendente,
  deleteAtendente,
  subscribeAtendentes,
  updateAtendente,
} from "../services/atendentes";
import { createPanelAuthUser } from "../services/auth";
import { deletePanelAccess, savePanelAccess, updatePanelAccess } from "../services/panelAccess";
import { getRoleLabel, isManagementRole, isSuperAdminRole, normalizeRole } from "../utils/access";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function Atendentes({ uid, accessUser }) {
  const [atendentes, setAtendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [meta, setMeta] = useState("");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState("atendente");
  const [emailAcesso, setEmailAcesso] = useState("");
  const [senhaAcesso, setSenhaAcesso] = useState("");
  const [editandoId, setEditandoId] = useState("");
  const [feedback, setFeedback] = useState("");
  const canManageSuperadmins = isSuperAdminRole(accessUser?.role);
  const roleGerencial = useMemo(() => isManagementRole(role), [role]);
  const atendenteEditando = useMemo(
    () => atendentes.find((item) => item.id === editandoId) || null,
    [atendentes, editandoId]
  );

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeAtendentes(uid, (lista) => {
      setAtendentes(lista);
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);

  function limparForm() {
    setNome("");
    setMeta("");
    setSenha("");
    setRole("atendente");
    setEmailAcesso("");
    setSenhaAcesso("");
    setEditandoId("");
  }

  async function provisionarAcessoPainel(atendenteId, dados) {
    const email = String(emailAcesso || "").trim().toLowerCase();
    const senhaPainel = String(senhaAcesso || "").trim();

    if (!email || !senhaPainel) {
      throw new Error("Informe email e senha de acesso ao painel.");
    }

    const authUser = await createPanelAuthUser(email, senhaPainel);

    await savePanelAccess(authUser.uid, {
      atendenteId,
      nome: dados.nome,
      role: dados.role,
      ativo: true,
      email,
    });

    await updateAtendente(atendenteId, {
      authUid: authUser.uid,
      emailAcesso: email,
    });
  }

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return;

    if (!canManageSuperadmins && role === "superadmin") {
      setFeedback("Somente o superadmin pode promover outro usuario para superadmin.");
      return;
    }

    const payload = {
      nome,
      meta: Number(meta || 0),
      senha,
      role,
      emailAcesso,
    };

    try {
      if (editandoId) {
        const atual = atendenteEditando;
        if (!atual) return;

        if (!canManageSuperadmins && isSuperAdminRole(atual.role)) {
          setFeedback("Somente o superadmin pode editar outro superadmin.");
          return;
        }

        await updateAtendente(editandoId, payload);

        if (atual.authUid) {
          if (isManagementRole(role)) {
            await updatePanelAccess(atual.authUid, {
              nome,
              role,
              ativo: atual.ativo !== false,
              email: atual.emailAcesso || emailAcesso,
            });
          } else {
            await deletePanelAccess(atual.authUid);
          }
        } else if (isManagementRole(role)) {
          await provisionarAcessoPainel(editandoId, { nome, role });
        }
      } else {
        const ref = await addAtendente(uid, { ...payload, ativo: true });

        if (isManagementRole(role)) {
          await provisionarAcessoPainel(ref.id, { nome, role });
        }
      }

      limparForm();
      setFeedback("");
    } catch (error) {
      console.error(error);
      setFeedback(
        error instanceof Error && error.message
          ? error.message
          : "Nao foi possivel salvar o atendente."
      );
    }
  }

  async function alternar(atendente) {
    if (!canManageSuperadmins && isSuperAdminRole(atendente.role)) {
      setFeedback("Somente o superadmin pode alterar outro superadmin.");
      return;
    }

    const ativo = atendente.ativo === false;
    await updateAtendente(atendente.id, { ativo });

    if (atendente.authUid) {
      await updatePanelAccess(atendente.authUid, { ativo });
    }
  }

  async function excluir(atendente) {
    if (!canManageSuperadmins && isSuperAdminRole(atendente.role)) {
      setFeedback("Somente o superadmin pode excluir outro superadmin.");
      return;
    }

    if (atendente.authUid) {
      await deletePanelAccess(atendente.authUid);
    }

    await deleteAtendente(atendente.id);
  }

  return (
    <div className="dashboard-screen">
      <div className="screen-heading section-card team-hero">
        <div>
          <h1 className="screen-title">Atendentes</h1>
          <p className="screen-description">Cadastro, ativacao, senha operacional e acessos do painel.</p>
        </div>
        <span className="screen-badge">Equipe e acessos</span>
      </div>

      <div className="screen-grid team-grid">
        <div className="section-card team-form-card">
          <div className="section-header">
            <div className="section-title">{editandoId ? "Editar atendente" : "Novo atendente"}</div>
          </div>
          <form className="stack-form" onSubmit={salvar}>
            <input
              className="input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do atendente"
            />
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              placeholder="Meta de vendas"
            />
            <input
              className="input"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Senha operacional do atendente"
            />
            <select className="input select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="atendente">Atendente</option>
              <option value="gerencia">Gerencia</option>
              {canManageSuperadmins ? <option value="superadmin">Superadmin</option> : null}
            </select>

            {roleGerencial || emailAcesso ? (
              <>
                <input
                  className="input"
                  type="email"
                  value={emailAcesso}
                  onChange={(e) => setEmailAcesso(e.target.value)}
                  placeholder="Email de acesso ao painel"
                  disabled={Boolean(editandoId && atendenteEditando?.authUid)}
                />
                {editandoId && atendenteEditando?.authUid ? (
                  <p className="helper-text">Acesso do painel ja vinculado a este usuario.</p>
                ) : (
                  <input
                    className="input"
                    type="password"
                    value={senhaAcesso}
                    onChange={(e) => setSenhaAcesso(e.target.value)}
                    placeholder="Senha de acesso ao painel"
                  />
                )}
              </>
            ) : null}

            <button className="action-btn action-btn-primary" type="submit">
              {editandoId ? "Atualizar atendente" : "Cadastrar atendente"}
            </button>
            {feedback ? <p className="inline-feedback">{feedback}</p> : null}
          </form>
        </div>

        <div className="section-card team-list-card">
          <div className="section-header">
            <div className="section-title">Equipe</div>
            <span className="section-subtitle">
              {loading ? "Carregando..." : `${atendentes.length} itens`}
            </span>
          </div>
          <div className="scroll-list">
            {atendentes.map((atendente) => (
              <div className="list-row" key={atendente.id}>
                <div>
                  <strong>{atendente.nome}</strong>
                  <small>
                    {atendente.ativo === false ? "Inativo" : "Ativo"} - {getRoleLabel(atendente.role)} - Meta{" "}
                    {formatMoney(atendente.meta || 0)}
                  </small>
                  <small>{atendente.senha ? "Senha operacional cadastrada" : "Sem senha operacional"}</small>
                  <small>
                    {atendente.authUid
                      ? `Acesso ao painel vinculado: ${atendente.emailAcesso || "Sem email"}`
                      : "Sem acesso autenticado ao painel"}
                  </small>
                </div>
                <div className="list-row-actions">
                  <button
                    className="mini-btn"
                    type="button"
                    onClick={() => {
                      if (!canManageSuperadmins && isSuperAdminRole(atendente.role)) {
                        setFeedback("Somente o superadmin pode editar outro superadmin.");
                        return;
                      }

                      setEditandoId(atendente.id);
                      setNome(atendente.nome || "");
                      setMeta(String(atendente.meta ?? ""));
                      setSenha(atendente.senha || "");
                      setRole(normalizeRole(atendente.role));
                      setEmailAcesso(atendente.emailAcesso || "");
                      setSenhaAcesso("");
                      setFeedback("");
                    }}
                  >
                    Editar
                  </button>
                  <button className="mini-btn" type="button" onClick={() => alternar(atendente)}>
                    {atendente.ativo === false ? "Ativar" : "Desativar"}
                  </button>
                  <button className="mini-btn danger" type="button" onClick={() => excluir(atendente)}>
                    Excluir
                  </button>
                </div>
              </div>
            ))}
            {!atendentes.length && !loading && <p className="empty-state">Nenhum atendente cadastrado.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
