import { useEffect, useState } from "react";
import {
  addAtendente,
  deleteAtendente,
  subscribeAtendentes,
  updateAtendente,
} from "../services/atendentes";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function Atendentes({ uid }) {
  const [atendentes, setAtendentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [meta, setMeta] = useState("");
  const [editandoId, setEditandoId] = useState("");

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeAtendentes(uid, (lista) => {
      setAtendentes(lista);
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return;

    const payload = { nome, meta: Number(meta || 0) };

    if (editandoId) {
      await updateAtendente(editandoId, payload);
    } else {
      await addAtendente(uid, { ...payload, ativo: true });
    }

    setNome("");
    setMeta("");
    setEditandoId("");
  }

  async function alternar(atendente) {
    await updateAtendente(atendente.id, { ativo: atendente.ativo === false });
  }

  return (
    <div className="dashboard-screen">
      <div className="screen-heading">
        <div>
          <h1 className="screen-title">Atendentes</h1>
          <p className="screen-description">Cadastro, ativacao e metas da equipe.</p>
        </div>
      </div>

      <div className="screen-grid">
        <div className="section-card">
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
            <button className="action-btn action-btn-primary" type="submit">
              {editandoId ? "Atualizar atendente" : "Cadastrar atendente"}
            </button>
          </form>
        </div>

        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Equipe</div>
            <span className="section-subtitle">{loading ? "Carregando..." : `${atendentes.length} itens`}</span>
          </div>
          <div className="scroll-list">
            {atendentes.map((atendente) => (
              <div className="list-row" key={atendente.id}>
                <div>
                  <strong>{atendente.nome}</strong>
                  <small>
                    {atendente.ativo === false ? "Inativo" : "Ativo"} • Meta {formatMoney(atendente.meta || 0)}
                  </small>
                </div>
                <div className="list-row-actions">
                  <button
                    className="mini-btn"
                    type="button"
                    onClick={() => {
                      setEditandoId(atendente.id);
                      setNome(atendente.nome || "");
                      setMeta(String(atendente.meta ?? ""));
                    }}
                  >
                    Editar
                  </button>
                  <button className="mini-btn" type="button" onClick={() => alternar(atendente)}>
                    {atendente.ativo === false ? "Ativar" : "Desativar"}
                  </button>
                  <button className="mini-btn danger" type="button" onClick={() => deleteAtendente(atendente.id)}>
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
