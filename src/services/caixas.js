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

function rangeQuery(dataInicio, dataFim) {
  return query(caixasRef, where("data", ">=", dataInicio), where("data", "<=", dataFim));
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
