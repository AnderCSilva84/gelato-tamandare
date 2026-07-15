import { useEffect, useState } from "react";
import { FiLayers } from "react-icons/fi";
import { cadastrarGestoresNaLoja, getAtendentes } from "../services/atendentes";
import { DEFAULT_LOJA_ID, deleteLoja, saveLoja, slugLoja, subscribeLojas } from "../services/lojas";

const EMPTY = { nome: "", documento: "", endereco: "", telefone: "", logomarca: "", imagemCapaPdv: "", status: "ativa", mensagemManutencao: "Unidade temporariamente indisponivel." };

export default function Lojas({ lojaAtivaId, onSelectLoja, redeId, onSimulate, canManageAvailability = false }) {
  const [lojas, setLojas] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editandoId, setEditandoId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [simuladorLoja, setSimuladorLoja] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [usuarioId, setUsuarioId] = useState("");

  useEffect(() => subscribeLojas(redeId, setLojas), [redeId]);

  function editar(loja) { setEditandoId(loja.id); setForm(loja); setFeedback(""); }
  function cancelarEdicao() { setEditandoId(""); setForm(EMPTY); }

  function lerLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) return setFeedback("A logomarca deve ter no maximo 1 MB.");
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, logomarca: String(reader.result || "") }));
    reader.readAsDataURL(file);
  }

  function lerCapaPdv(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 600 * 1024) return setFeedback("A imagem de fundo deve ter no maximo 600 KB.");
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, imagemCapaPdv: String(reader.result || "") }));
    reader.readAsDataURL(file);
  }

  async function salvar(event) {
    event.preventDefault();
    try {
      const lojaId = await saveLoja(editandoId || slugLoja(form.nome), {
        ...form,
        redeId,
        status: canManageAvailability ? form.status : "ativa",
        ativa: true,
      });
      await cadastrarGestoresNaLoja(lojaId);
      cancelarEdicao();
      setFeedback("Unidade salva com sucesso.");
    } catch (error) { setFeedback(error?.message || "Nao foi possivel salvar a unidade."); }
  }

  async function excluir(loja) {
    if (!window.confirm(`Excluir o cadastro de ${loja.nome}?`)) return;
    try { await deleteLoja(loja.id); } catch (error) { setFeedback(error?.message || "Nao foi possivel excluir."); }
  }

  async function abrirSimulador(loja) {
    try {
      const lista = await getAtendentes(loja.id);
      setSimuladorLoja(loja); setUsuarios(lista.filter((item) => item.ativo !== false)); setUsuarioId("");
    } catch { setFeedback("Nao foi possivel carregar os usuarios desta unidade."); }
  }

  function iniciarSimulacao() {
    const usuario = usuarios.find((item) => item.id === usuarioId);
    if (usuario && simuladorLoja) onSimulate({ ...usuario, lojaId: simuladorLoja.id, lojaNome: simuladorLoja.nome });
  }

  return <div className="dashboard-screen">
    <div className="screen-heading section-card"><div><h1 className="screen-title app-hero-title-blue screen-title-with-icon"><FiLayers /> Unidades da rede</h1><p className="screen-description">Cadastre filiais, escolha a unidade de trabalho e simule acessos.</p></div><span className="screen-badge">{canManageAvailability ? "Superadmin" : "Gerencia"}</span></div>
    <div className="screen-grid">
      <form className="section-card stack-form" onSubmit={salvar}>
        <div className="section-title">{editandoId ? "Editar unidade" : "Nova unidade"}</div>
        <input className="input" placeholder="Nome da unidade" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        <input className="input" placeholder="CNPJ ou CPF" value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
        <input className="input" placeholder="Endereco" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
        <input className="input" placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
        <label className="field-label">Logomarca (PNG/JPG, ate 1 MB)</label><input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={lerLogo} />
        {form.logomarca ? <img src={form.logomarca} alt="Previa da logomarca" style={{ width: 96, height: 96, objectFit: "contain" }} /> : null}
        <label className="field-label">Imagem de fundo do banner do PDV (ate 600 KB)</label><input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={lerCapaPdv} />
        {form.imagemCapaPdv ? <div style={{ width: "100%", height: 130, borderRadius: 14, backgroundImage: `url(${form.imagemCapaPdv})`, backgroundSize: "cover", backgroundPosition: "center" }} role="img" aria-label="Previa da imagem do banner" /> : null}
        {form.imagemCapaPdv ? <button className="mini-btn danger" type="button" onClick={() => { if (window.confirm("Deseja realmente remover a imagem do banner?")) setForm({ ...form, imagemCapaPdv: "" }); }}>Remover imagem do banner</button> : null}
        {canManageAvailability ? <><label className="field-label">Disponibilidade</label><select className="input select" value={form.status || "ativa"} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ativa">Ativa</option><option value="manutencao">Em manutencao</option><option value="suspensa">Suspensa</option><option value="inativa">Inativa</option></select></> : <p className="helper-text">Somente o superadmin pode alterar a disponibilidade da unidade.</p>}
        {canManageAvailability && form.status !== "ativa" ? <textarea className="input" rows="3" value={form.mensagemManutencao || ""} onChange={(e) => setForm({ ...form, mensagemManutencao: e.target.value })} placeholder="Mensagem apresentada aos usuarios" /> : null}
        <div className="section-actions"><button className="action-btn action-btn-primary" type="submit">Salvar unidade</button>{editandoId ? <button className="action-btn action-btn-secondary" type="button" onClick={cancelarEdicao}>Cancelar</button> : null}</div>{feedback ? <p className="inline-feedback">{feedback}</p> : null}
      </form>
      <div className="section-card"><div className="section-header"><div className="section-title">Unidades cadastradas</div><span className="section-subtitle">{lojas.length} unidade(s)</span></div><div className="scroll-list">
        {lojas.map((loja) => <div className="list-row" key={loja.id}><div><strong>{loja.nome}</strong><small>{loja.documento || loja.id} · {loja.status || "ativa"}</small></div><div className="list-row-actions"><button className="mini-btn" type="button" disabled={!canManageAvailability && loja.status !== "ativa"} onClick={() => onSelectLoja(loja.id)}>{lojaAtivaId === loja.id ? "Em uso" : "Usar unidade"}</button><button className="mini-btn" type="button" onClick={() => abrirSimulador(loja)}>Simular</button><button className="mini-btn" type="button" onClick={() => editar(loja)}>Editar</button>{canManageAvailability && loja.id !== DEFAULT_LOJA_ID ? <button className="mini-btn danger" type="button" onClick={() => excluir(loja)}>Excluir</button> : null}</div></div>)}
      </div></div>
    </div>
    {simuladorLoja ? <div className="section-card"><div className="section-header"><div className="section-title">Simular acesso · {simuladorLoja.nome}</div><button className="mini-btn" type="button" onClick={() => setSimuladorLoja(null)}>Fechar</button></div><div className="section-actions"><select className="input select" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}><option value="">Selecione um usuario</option>{usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nome} · {usuario.role}</option>)}</select><button className="action-btn action-btn-warning" type="button" disabled={!usuarioId} onClick={iniciarSimulacao}>Simular somente leitura</button></div></div> : null}
  </div>;
}
