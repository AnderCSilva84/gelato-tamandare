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

const caixasRef = collection(db, "caixas");
const retiradasRef = collection(db, "retiradas_caixa");

function rangeQuery(dataInicio, dataFim) {
  return query(caixasRef, where("data", ">=", dataInicio), where("data", "<=", dataFim));
}

function retiradaDayQuery(data) {
  return query(retiradasRef, where("data", "==", data));
}

function sortByDateAndStatus(items) {
  return [...items].sort((a, b) => {
    const dataA = String(a?.data || "");
    const dataB = String(b?.data || "");
    const byDate = dataB.localeCompare(dataA);
    if (byDate !== 0) return byDate;

    if (a?.status === b?.status) return 0;
    return a?.status === "aberto" ? -1 : 1;
  });
}

export async function abrirCaixa(uid, dados) {
  return addDoc(caixasRef, {
    uid: uid || null,
    atendenteId: String(dados?.atendenteId || "").trim(),
    atendenteNome: String(dados?.atendenteNome || "").trim(),
    data: String(dados?.data || "").trim(),
    fundoCaixa: Number(dados?.fundoCaixa || 0),
    status: "aberto",
    abertoEm: serverTimestamp(),
    fechadoEm: null,
    totalVendas: 0,
    totalItens: 0,
  });
}

export async function fecharCaixa(id, dados) {
  if (!id) throw new Error("Caixa invalido.");

  await updateDoc(doc(db, "caixas", id), {
    status: "fechado",
    fechadoEm: serverTimestamp(),
    totalVendas: Number(dados?.totalVendas || 0),
    totalItens: Number(dados?.totalItens || 0),
    totalDinheiro: Number(dados?.totalDinheiro || 0),
    valorEmCaixa: Number(dados?.valorEmCaixa || 0),
  });
}

export async function getCaixa(id) {
  if (!id) return null;
  const snapshot = await getDoc(doc(db, "caixas", id));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export function subscribeCaixa(id, callback) {
  if (!id) {
    callback(null);
    return () => {};
  }

  return onSnapshot(doc(db, "caixas", id), (snapshot) => {
    callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  });
}

export async function getCaixas(dataInicio, dataFim = dataInicio) {
  if (!dataInicio) return [];
  const snapshot = await getDocs(rangeQuery(dataInicio, dataFim));
  return sortByDateAndStatus(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
}

export async function deleteCaixa(id) {
  if (!id) throw new Error("Caixa invalido.");
  return deleteDoc(doc(db, "caixas", id));
}

function sortByCreatedAt(items) {
  return [...items].sort((a, b) => {
    const dateA =
      typeof a?.criadoEm?.toDate === "function" ? a.criadoEm.toDate().getTime() : 0;
    const dateB =
      typeof b?.criadoEm?.toDate === "function" ? b.criadoEm.toDate().getTime() : 0;
    if (dateA !== dateB) return dateB - dateA;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
}

export async function addRetiradaCaixa(uid, dados) {
  return addDoc(retiradasRef, {
    uid: uid || null,
    caixaId: String(dados?.caixaId || "").trim(),
    atendenteId: String(dados?.atendenteId || "").trim(),
    atendenteNome: String(dados?.atendenteNome || "").trim(),
    valor: Number(dados?.valor || 0),
    motivo: String(dados?.motivo || "").trim(),
    data: String(dados?.data || "").trim(),
    criadoEm: serverTimestamp(),
  });
}

export function subscribeRetiradasCaixa(caixaId, callback) {
  if (!caixaId) {
    callback([]);
    return () => {};
  }

  return onSnapshot(query(retiradasRef, where("caixaId", "==", caixaId)), (snapshot) => {
    callback(sortByCreatedAt(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
  });
}

export function subscribeRetiradasDoDia(data, callback) {
  if (!data) {
    callback([]);
    return () => {};
  }

  return onSnapshot(retiradaDayQuery(data), (snapshot) => {
    callback(sortByCreatedAt(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))));
  });
}
