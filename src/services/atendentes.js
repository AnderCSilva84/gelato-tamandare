import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeRole } from "../utils/access";

const atendentesRef = collection(db, "atendentes");

function cleanData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function atendentesQuery(uid) {
  return query(atendentesRef, where("uid", "==", uid));
}

function sortAtendentes(items) {
  return [...items].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
}

function getCurrentMonthKey(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
  }).formatToParts(referenceDate);
  const year = parts.find((item) => item.type === "year")?.value || "0000";
  const month = parts.find((item) => item.type === "month")?.value || "01";
  return `${year}-${month}`;
}

export async function addAtendente(uid, dados) {
  const meta = Number(dados?.meta || 0);
  return addDoc(atendentesRef, {
    uid: uid || null,
    cadastroGlobalId: String(dados?.cadastroGlobalId || "").trim(),
    nome: String(dados?.nome || "").trim(),
    meta,
    metasMensais: {
      [getCurrentMonthKey()]: meta,
    },
    senha: String(dados?.senha || "").trim(),
    role: normalizeRole(dados?.role),
    emailAcesso: String(dados?.emailAcesso || "").trim().toLowerCase(),
    authUid: String(dados?.authUid || "").trim(),
    avatarTipo: dados?.avatarTipo === "feminino" ? "feminino" : "masculino",
    fotoPerfil: String(dados?.fotoPerfil || "").trim(),
    podeGerenciarProdutos: Boolean(dados?.podeGerenciarProdutos),
    ativo: dados?.ativo ?? true,
    criadoEm: serverTimestamp(),
  });
}

export async function copiarAtendenteParaLojas(atendente, lojaIds = []) {
  if (!atendente?.id) throw new Error("Atendente invalido.");
  const destinos = [...new Set(lojaIds.map(String).filter((id) => id && id !== atendente.uid))];
  if (!destinos.length) return 0;

  const cadastroGlobalId = String(atendente.cadastroGlobalId || atendente.id);
  if (!atendente.cadastroGlobalId) await updateAtendente(atendente.id, { cadastroGlobalId });
  const payload = { ...atendente, cadastroGlobalId };
  delete payload.id;
  delete payload.uid;
  delete payload.criadoEm;

  const verificacoes = await Promise.all(destinos.map(async (lojaId) => ({
    lojaId,
    atendentes: await getAtendentes(lojaId),
  })));
  const pendentes = verificacoes
    .filter(({ atendentes }) => !atendentes.some((item) => String(item.cadastroGlobalId || "") === cadastroGlobalId))
    .map(({ lojaId }) => lojaId);
  await Promise.all(pendentes.map((lojaId) => addAtendente(lojaId, payload)));
  return pendentes.length;
}

export async function cadastrarGestoresNaLoja(lojaId) {
  const snapshot = await getDocs(atendentesRef);
  const todos = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  const gestores = todos.filter((item) => item.ativo !== false && normalizeRole(item.role) !== "atendente");
  const unicos = [...new Map(gestores.map((item) => [item.authUid || item.cadastroGlobalId || item.id, item])).values()];
  return Promise.all(unicos.map((item) => copiarAtendenteParaLojas(item, [lojaId])));
}

export async function cadastrarGestoresEmTodasLojas(lojaIds = []) {
  return Promise.all([...new Set(lojaIds.map(String).filter(Boolean))].map(cadastrarGestoresNaLoja));
}

export async function updateAtendente(id, dados) {
  if (!id) throw new Error("Atendente invalido.");

  let metasMensais = dados?.metasMensais;

  if (dados?.meta !== undefined && metasMensais === undefined) {
    const snapshot = await getDoc(doc(db, "atendentes", id));
    const atual = snapshot.exists() ? snapshot.data() : {};
    metasMensais = {
      ...(atual?.metasMensais || {}),
      [getCurrentMonthKey()]: Number(dados.meta || 0),
    };
  }

  return updateDoc(
    doc(db, "atendentes", id),
    cleanData({
      ...dados,
      nome: dados?.nome !== undefined ? String(dados.nome).trim() : undefined,
      meta: dados?.meta !== undefined ? Number(dados.meta) : undefined,
      senha: dados?.senha !== undefined ? String(dados.senha).trim() : undefined,
      role: dados?.role !== undefined ? normalizeRole(dados.role) : undefined,
      emailAcesso:
        dados?.emailAcesso !== undefined ? String(dados.emailAcesso).trim().toLowerCase() : undefined,
      authUid: dados?.authUid !== undefined ? String(dados.authUid).trim() : undefined,
      podeGerenciarProdutos:
        dados?.podeGerenciarProdutos !== undefined ? Boolean(dados.podeGerenciarProdutos) : undefined,
      metasMensais,
      ativo: dados?.ativo,
    })
  );
}

export async function deleteAtendente(id) {
  if (!id) throw new Error("Atendente invalido.");
  return deleteDoc(doc(db, "atendentes", id));
}

export async function getAtendentes(uid) {
  const snapshot = await getDocs(atendentesQuery(uid));
  return sortAtendentes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

export function subscribeAtendentes(uid, callback, onError) {
  return onSnapshot(atendentesQuery(uid), (snapshot) => {
    callback(sortAtendentes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
  }, (error) => {
    console.error("Erro ao carregar atendentes:", error);
    callback([]);
    if (typeof onError === "function") onError(error);
  });
}
