import { useEffect, useMemo, useState } from "react";
import {
  addAtendente,
  cadastrarGestoresEmTodasLojas,
  copiarAtendenteParaLojas,
  deleteAtendente,
  subscribeAtendentes,
  updateAtendente,
} from "../services/atendentes";
import { createPanelAuthUser, updatePanelAuthPassword } from "../services/auth";
import { deletePanelAccess, savePanelAccess, updatePanelAccess } from "../services/panelAccess";
import { buildAtendenteEmail } from "../services/loginsAtendentes";
import { getRoleLabel, isManagementRole, isSuperAdminRole, normalizeRole } from "../utils/access";
import { FiUsers } from "react-icons/fi";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function Atendentes({ uid, accessUser, lojas = [] }) {
  const [atendentes, setAtendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [meta, setMeta] = useState("");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState("atendente");
  const [emailAcesso, setEmailAcesso] = useState("");
  const [senhaAcesso, setSenhaAcesso] = useState("");
  const [avatarTipo, setAvatarTipo] = useState("masculino");
  const [fotoPerfil, setFotoPerfil] = useState("");
  const [podeGerenciarProdutos, setPodeGerenciarProdutos] = useState(false);
  const [editandoId, setEditandoId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [destinosAtendente, setDestinosAtendente] = useState([]);
  const canManageSuperadmins = isSuperAdminRole(accessUser?.role);
  const atendenteEditando = useMemo(
    () => atendentes.find((item) => item.id === editandoId) || null,
    [atendentes, editandoId]
  );

  useEffect(() => {
    if (!lojas.length || !isSuperAdminRole(accessUser?.role)) return;
    cadastrarGestoresEmTodasLojas(lojas.map((item) => item.id)).catch(() => {
      setFeedback("Nao foi possivel sincronizar todos os gestores entre as unidades.");
    });
  }, [accessUser?.role, lojas]);

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
    setAvatarTipo("masculino");
    setFotoPerfil("");
    setPodeGerenciarProdutos(false);
    setEditandoId("");
  }

  function lerFotoPerfil(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) {
      setFeedback("A foto do perfil deve ter no maximo 300 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFotoPerfil(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function provisionarAcessoPainel(atendenteId, dados) {
    const lojaIds = isManagementRole(dados.role) ? lojas.map((loja) => loja.id) : [uid];
    const isAtendente = normalizeRole(dados.role) === "atendente";
    const email = isAtendente
      ? buildAtendenteEmail(uid, dados.nome)
      : String(emailAcesso || "").trim().toLowerCase();
    const senhaPainel = isAtendente
      ? String(senha || "").trim()
      : String(senhaAcesso || "").trim();

    if (!email || !senhaPainel) {
      throw new Error(isAtendente ? "Informe uma senha operacional." : "Informe email e senha de acesso ao painel.");
    }

    const authUser = await createPanelAuthUser(email, senhaPainel);

    await savePanelAccess(authUser.uid, {
      atendenteId,
      nome: dados.nome,
      role: dados.role,
      ativo: true,
      email,
      lojaId: uid,
      lojaIds,
      avatarTipo,
      fotoPerfil,
      podeGerenciarProdutos,
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

    if (normalizeRole(role) === "atendente" && String(senha || "").length < 6) {
      setFeedback("A senha do atendente precisa ter pelo menos 6 caracteres.");
      return;
    }

    const payload = {
      nome,
      meta: Number(meta || 0),
      senha,
      role,
      emailAcesso,
      avatarTipo,
      fotoPerfil,
      podeGerenciarProdutos,
    };

    try {
      if (editandoId) {
        const atual = atendenteEditando;
        if (!atual) return;

        if (!canManageSuperadmins && isSuperAdminRole(atual.role)) {
          setFeedback("Somente o superadmin pode editar outro superadmin.");
          return;
        }

        const emailAtendente = buildAtendenteEmail(uid, nome);
        const migrarParaLoginPorNome = normalizeRole(role) === "atendente"
          && atual.emailAcesso !== emailAtendente;

        if (
          atual.authUid
          && !migrarParaLoginPorNome
          && normalizeRole(role) === "atendente"
          && senha
          && senha !== String(atual.senha || "")
          && atual.emailAcesso
          && atual.senha
        ) {
          await updatePanelAuthPassword(atual.emailAcesso, String(atual.senha), senha);
        }

        await updateAtendente(editandoId, payload);

        if (migrarParaLoginPorNome) {
          await provisionarAcessoPainel(editandoId, { nome, role });
          if (atual.authUid) await deletePanelAccess(atual.authUid);
        } else if (atual.authUid) {
            await updatePanelAccess(atual.authUid, {
              nome,
              role,
              ativo: atual.ativo !== false,
              email: atual.emailAcesso || emailAcesso,
              lojaId: uid,
              lojaIds: isManagementRole(role) ? lojas.map((loja) => loja.id) : [uid],
              avatarTipo,
              fotoPerfil,
              podeGerenciarProdutos,
            });
        } else {
          await provisionarAcessoPainel(editandoId, { nome, role });
        }
      } else {
        const ref = await addAtendente(uid, { ...payload, ativo: true });

        await provisionarAcessoPainel(ref.id, { nome, role });
      }

      if (isManagementRole(role)) {
        await cadastrarGestoresEmTodasLojas(lojas.map((item) => item.id));
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

    if (!window.confirm(`Deseja realmente excluir o cadastro de ${atendente.nome}?`)) return;

    if (atendente.authUid) {
      await deletePanelAccess(atendente.authUid);
    }

    await deleteAtendente(atendente.id);
  }

  async function copiarAtendente(atendente) {
    if (!destinosAtendente.length) return setFeedback("Selecione ao menos uma unidade de destino.");
    try {
      const total = await copiarAtendenteParaLojas(atendente, destinosAtendente);
      setFeedback(total ? `Atendente disponibilizado em ${total} unidade(s).` : "O atendente ja existe nas unidades selecionadas.");
    } catch {
      setFeedback("Nao foi possivel copiar o atendente.");
    }
  }

  return (
    <div className="dashboard-screen">
      <div className="screen-heading section-card team-hero">
        <div>
          <h1 className="screen-title app-hero-title-blue screen-title-with-icon"><FiUsers /> Atendentes</h1>
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
            {normalizeRole(role) === "atendente" ? (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={podeGerenciarProdutos}
                  onChange={(e) => setPodeGerenciarProdutos(e.target.checked)}
                />
                Pode cadastrar e gerenciar produtos no estoque
              </label>
            ) : null}
            <label className="field-label">Avatar do usuario</label>
            <select className="input select" value={avatarTipo} onChange={(e) => setAvatarTipo(e.target.value)}>
              <option value="masculino">Masculino azul</option>
              <option value="feminino">Feminino rosa</option>
            </select>
            <label className="field-label">Foto do usuario (opcional, ate 300 KB)</label>
            <input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={lerFotoPerfil} />
            {fotoPerfil ? <div className="profile-photo-preview"><img src={fotoPerfil} alt="Previa do perfil" /><button className="mini-btn danger" type="button" onClick={() => { if (window.confirm("Deseja realmente remover esta foto?")) setFotoPerfil(""); }}>Remover foto</button></div> : null}

            {normalizeRole(role) !== "atendente" ? (
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
            ) : (
              <p className="helper-text">O atendente entrará no sistema usando o nome e a senha operacional.</p>
            )}

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
          <div className="stack-form">
            <label className="field-label">Disponibilizar cadastro também em</label>
            {lojas.filter((item) => item.id !== uid).map((item) => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={destinosAtendente.includes(item.id)} onChange={(e) => setDestinosAtendente((prev) => e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id))} />{item.nome}</label>)}
          </div>
          <div className="scroll-list">
            {atendentes.map((atendente) => (
              <div className="list-row" key={atendente.id}>
                <div className="team-member-identity">
                  <span className={`team-member-avatar is-${atendente.avatarTipo || "masculino"}`}>{atendente.fotoPerfil ? <img src={atendente.fotoPerfil} alt={atendente.nome} /> : "♙"}</span>
                  <div>
                  <strong>{atendente.nome}</strong>
                  <small>
                    {atendente.ativo === false ? "Inativo" : "Ativo"} - {getRoleLabel(atendente.role)} - Meta{" "}
                    <span className="positive">{formatMoney(atendente.meta || 0)}</span>
                  </small>
                  <small>{atendente.senha ? "Senha operacional cadastrada" : "Sem senha operacional"}</small>
                  {normalizeRole(atendente.role) === "atendente" ? (
                    <small>{atendente.podeGerenciarProdutos ? "Acesso ao Estoque liberado" : "Sem acesso ao Estoque"}</small>
                  ) : null}
                  <small>
                    {atendente.authUid
                      ? `Acesso ao painel vinculado: ${atendente.emailAcesso || "Sem email"}`
                      : "Sem acesso autenticado ao painel"}
                  </small>
                  </div>
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
                      setAvatarTipo(atendente.avatarTipo || "masculino");
                      setFotoPerfil(atendente.fotoPerfil || "");
                      setPodeGerenciarProdutos(Boolean(atendente.podeGerenciarProdutos));
                      setFeedback("");
                    }}
                  >
                    Editar
                  </button>
                  <button className="mini-btn" type="button" onClick={() => alternar(atendente)}>
                    {atendente.ativo === false ? "Ativar" : "Desativar"}
                  </button>
                  <button className="mini-btn" type="button" onClick={() => copiarAtendente(atendente)}>Copiar para unidades</button>
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
